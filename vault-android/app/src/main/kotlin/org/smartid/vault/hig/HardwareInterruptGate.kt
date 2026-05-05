package org.smartid.vault.hig

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import org.smartid.vault.audit.AuditLogger
import org.smartid.vault.audit.QesAuditEntry
import org.smartid.vault.ghost.GhostActuatorBridge
import org.smartid.vault.haptic.HapticNotifier
import org.smartid.vault.overlay.QesOverlayService

class HardwareInterruptGate(
    private val context: Context,
    private val hapticNotifier: HapticNotifier = HapticNotifier(context),
    private val auditLogger: AuditLogger = AuditLogger(context),
) {

    enum class State {
        IDLE,
        ARMED,
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
    private var bridgeCallbacksRegistered = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val timeoutMs = 30_000L

    init {
        registerBridgeCallbacks()
    }

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

        state = State.ARMED
        armTimestamp = System.currentTimeMillis()
        Log.i(TAG, "Transitioned to ARMED (session=$sessionId)")

        hapticNotifier.startSosHaptic()

        QesOverlayService.show(context)

        state = State.WAITING
        Log.i(TAG, "Transitioned to WAITING (session=$sessionId)")

        startTimeout()
    }

    fun onKeyEvent(event: KeyEvent): Boolean {
        if (state != State.WAITING) {
            val currentState = state
            Log.d(TAG, "onKeyEvent ignored in state $currentState")
            return false
        }

        if (event.action != KeyEvent.ACTION_DOWN) {
            return false
        }

        when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_DOWN -> {
                interruptTimestamp = System.currentTimeMillis()
                state = State.RELEASED
                Log.i(TAG, "Transitioned to RELEASED via Volume Down")
                cancelTimeout()
                hapticNotifier.stopSosHaptic()
                QesOverlayService.dismiss(context)
                releaseGhostActuator()
                return true
            }

            KeyEvent.KEYCODE_VOLUME_UP -> {
                interruptTimestamp = System.currentTimeMillis()
                transitionToCancelled("VOLUME_UP")
                return true
            }

            else -> return false
        }
    }

    fun onGhostActuatorCompleted() {
        if (state != State.RELEASED) {
            Log.w(TAG, "onGhostActuatorCompleted called in state $state (expected RELEASED)")
            return
        }

        actuationTimestamp = System.currentTimeMillis()
        state = State.EXECUTED
        Log.i(TAG, "Transitioned to EXECUTED")

        val entry = QesAuditEntry(
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
        auditLogger.logEntry(entry)

        state = State.COMPLETED
        Log.i(TAG, "Transitioned to COMPLETED")
    }

    fun onGhostActuatorFailed(failedIndex: Int) {
        Log.w(TAG, "GhostActuator execution failed at tap $failedIndex")
        if (state == State.RELEASED) {
            transitionToCancelled("EXECUTION_FAILED")
        }
    }

    fun reset() {
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
        Log.i(TAG, "Transitioned to CANCELLED via $interruptType")
    }

    private fun startTimeout() {
        val runnable = Runnable {
            if (state == State.WAITING) {
                interruptTimestamp = 0L
                transitionToCancelled("TIMEOUT")
            }
        }
        timeoutRunnable = runnable
        mainHandler.postDelayed(runnable, timeoutMs)
    }

    private fun cancelTimeout() {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null
    }

    private fun releaseGhostActuator() {
        GhostActuatorBridge.executeSequence()
        Log.i(TAG, "GhostActuator release signal sent via bridge")
    }

    private fun registerBridgeCallbacks() {
        if (bridgeCallbacksRegistered) return
        GhostActuatorBridge.setOnCompleted { onGhostActuatorCompleted() }
        GhostActuatorBridge.setOnFailed { failedIndex -> onGhostActuatorFailed(failedIndex) }
        bridgeCallbacksRegistered = true
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

    companion object {
        private const val TAG = "HardwareInterruptGate"
    }
}
