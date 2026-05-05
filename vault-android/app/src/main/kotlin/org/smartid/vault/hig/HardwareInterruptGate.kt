package org.smartid.vault.hig

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import org.smartid.vault.audit.AuditLogger
import org.smartid.vault.audit.QesAuditEntry
import org.smartid.vault.ghost.GhostActuatorBridge
import org.smartid.vault.ghost.GhostActuatorService
import org.smartid.vault.haptic.HapticNotifier
import org.smartid.vault.overlay.QesOverlayService

class HardwareInterruptGate(
    private val context: Context,
    private val hapticNotifier: HapticNotifier = HapticNotifier(context),
    private val auditLogger: AuditLogger = AuditLogger(context),
) {
    companion object {
        const val TIMEOUT_MS = 30_000L
        private const val TAG = "HardwareInterruptGate"
    }

    enum class State {
        IDLE,
        WAITING,
        RELEASED,
        CANCELLED,
        EXECUTED,
        COMPLETED,
    }

    private var state = State.IDLE
    private var armTimestamp: Long = 0L
    private var interruptTimestamp: Long = 0L
    private var actuationTimestamp: Long = 0L
    private var sessionId: String = ""
    private var transactionHash: String = ""
    private var zkTlsProofHash: String = ""
    private var webauthnAssertionHash: String = ""
    private var timeoutRunnable: Runnable? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    fun arm(
        sessionId: String,
        transactionHash: String,
        zkTlsProofHash: String,
        webauthnAssertionHash: String,
    ) {
        if (state != State.IDLE) {
            Log.w(TAG, "arm() called in non-IDLE state: $state")
            return
        }

        this.sessionId = sessionId
        this.transactionHash = transactionHash
        this.zkTlsProofHash = zkTlsProofHash
        this.webauthnAssertionHash = webauthnAssertionHash

        armTimestamp = System.currentTimeMillis()
        Log.i(TAG, "Arming (session=$sessionId)")

        hapticNotifier.startSosHaptic()
        QesOverlayService.show(context)

        state = State.WAITING
        Log.i(TAG, "Transitioned to WAITING (session=$sessionId)")

        registerBridgeCallbacks()
        startTimeout()
    }

    fun onKeyEvent(event: KeyEvent): Boolean {
        if (state != State.WAITING) {
            Log.d(TAG, "onKeyEvent ignored in state $state")
            return false
        }

        if (event.action != KeyEvent.ACTION_DOWN) {
            return false
        }

        when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_DOWN -> {
                mainHandler.post {
                    interruptTimestamp = System.currentTimeMillis()
                    state = State.RELEASED
                    Log.i(TAG, "Transitioned to RELEASED via Volume Down")
                    hapticNotifier.stopSosHaptic()
                    QesOverlayService.dismiss(context)

                    val bridgeOk = GhostActuatorBridge.executeSequence()
                    if (!bridgeOk) {
                        GhostActuatorService.executeSequence(context)
                    }
                }
                return true
            }

            KeyEvent.KEYCODE_VOLUME_UP -> {
                mainHandler.post {
                    interruptTimestamp = System.currentTimeMillis()
                    cancelTimeout()
                    transitionToCancelled("VOLUME_UP")
                }
                return true
            }

            else -> return false
        }
    }

    fun onGhostActuatorCompleted() {
        mainHandler.post { handleActuatorCompleted() }
    }

    fun onGhostActuatorFailed(failedIndex: Int) {
        mainHandler.post { handleActuatorFailed(failedIndex) }
    }

    fun reset() {
        mainHandler.post { handleReset() }
    }

    private fun handleActuatorCompleted() {
        if (state != State.RELEASED) {
            Log.d(TAG, "onGhostActuatorCompleted ignored in state $state")
            return
        }

        actuationTimestamp = System.currentTimeMillis()
        state = State.EXECUTED
        Log.i(TAG, "Transitioned to EXECUTED")

        try {
            auditLogger.logEntry(
                QesAuditEntry(
                    sessionId = sessionId,
                    timestamp = System.currentTimeMillis(),
                    transactionHash = transactionHash,
                    zkTlsProofHash = zkTlsProofHash,
                    webauthnAssertionHash = webauthnAssertionHash,
                    armTimestamp = armTimestamp,
                    interruptType = "VOLUME_DOWN",
                    interruptTimestamp = interruptTimestamp,
                    actuationTimestamp = actuationTimestamp,
                    result = "COMPLETED",
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to persist audit entry for COMPLETED", e)
        }

        state = State.COMPLETED
        cancelTimeout()
        Log.i(TAG, "Transitioned to COMPLETED")
    }

    private fun handleActuatorFailed(failedIndex: Int) {
        Log.w(TAG, "GhostActuator execution failed at tap $failedIndex")
        if (state == State.RELEASED) {
            Log.w(TAG, "Actuator failure in RELEASED state — restarting safety timeout")
            startTimeout()
        }
    }

    private fun handleReset() {
        cancelTimeout()
        hapticNotifier.stopSosHaptic()
        QesOverlayService.dismiss(context)
        GhostActuatorBridge.clearSequence()
        clearSessionFields()
        state = State.IDLE
        Log.i(TAG, "Reset to IDLE")
    }

    fun getState(): State = state

    private fun transitionToCancelled(interruptType: String) {
        cancelTimeout()
        hapticNotifier.stopSosHaptic()
        QesOverlayService.dismiss(context)
        GhostActuatorBridge.clearSequence()
        state = State.CANCELLED
        try {
            auditLogger.logEntry(
                QesAuditEntry(
                    sessionId = sessionId,
                    timestamp = System.currentTimeMillis(),
                    transactionHash = transactionHash,
                    zkTlsProofHash = zkTlsProofHash,
                    webauthnAssertionHash = webauthnAssertionHash,
                    armTimestamp = armTimestamp,
                    interruptType = interruptType,
                    interruptTimestamp = interruptTimestamp,
                    actuationTimestamp = 0L,
                    result = "CANCELLED",
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to persist audit entry for CANCELLED", e)
        }
        Log.i(TAG, "Transitioned to CANCELLED via $interruptType")
    }

    private fun startTimeout() {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        val runnable = Runnable {
            if (state == State.WAITING || state == State.RELEASED) {
                interruptTimestamp = if (state == State.RELEASED) interruptTimestamp else 0L
                transitionToCancelled("TIMEOUT")
            }
        }
        timeoutRunnable = runnable
        mainHandler.postDelayed(runnable, TIMEOUT_MS)
    }

    private fun cancelTimeout() {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null
    }

    private fun registerBridgeCallbacks() {
        GhostActuatorBridge.setOnCompleted { onGhostActuatorCompleted() }
        GhostActuatorBridge.setOnFailed { failedIndex -> onGhostActuatorFailed(failedIndex) }
        Log.d(TAG, "Bridge callbacks (re)registered")
    }

    private fun clearSessionFields() {
        sessionId = ""
        transactionHash = ""
        zkTlsProofHash = ""
        webauthnAssertionHash = ""
        armTimestamp = 0L
        interruptTimestamp = 0L
        actuationTimestamp = 0L
    }
}
