package com.smartid.vault.ghostactuator

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.GestureDescription
import com.smartid.vault.audit.AuditLogger
import com.smartid.vault.ghostactuator.orchestrator.OrchestratorInterface
import com.smartid.vault.ghostactuator.orchestrator.PinError
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicReference

class GhostActuatorService : AccessibilityService(), OrchestratorInterface {

    private lateinit var pinGridAnalyzer: PinGridAnalyzer
    private lateinit var gestureOptions: GestureOptions
    private lateinit var errorRecovery: ErrorRecovery
    private lateinit var executionConfirmation: ExecutionConfirmation
    private lateinit var fallbackCoordinator: FallbackCoordinator
    private lateinit var auditLogger: AuditLogger
    private lateinit var setupGuide: AccessibilitySetupGuide
    private lateinit var notificationManager: ServiceNotificationManager

    private val pendingGestureState = AtomicReference<GestureState>()

    private data class GestureState(
        val future: CompletableFuture<Boolean>,
        val callback: (Boolean) -> Unit,
    )

    override fun onServiceConnected() {
        super.onServiceConnected()

        auditLogger = AuditLogger()
        setupGuide = AccessibilitySetupGuide(this)
        notificationManager = ServiceNotificationManager(this)
        pinGridAnalyzer = PinGridAnalyzer(this)
        errorRecovery = ErrorRecovery(this)

        gestureOptions = GestureOptions.fromPreferences(this)
            .withAdaptiveTiming()

        executionConfirmation = ExecutionConfirmation(this, auditLogger)

        val webRtcFallback = WebRtcFallback { requestManualPhoneInteraction() }
        fallbackCoordinator = FallbackCoordinator(webRtcFallback)

        notificationManager.createNotificationChannel()
        checkServiceStatus()
    }

    fun executeGestureSequence(
        coordinates: FloatArray,
        options: GestureOptions? = null,
    ): CompletableFuture<Boolean> {
        val opts = options ?: gestureOptions
        val future = CompletableFuture<Boolean>()

        val callback: (Boolean) -> Unit = { success ->
            future.complete(success)
            pendingGestureState.set(null)
        }

        val newState = GestureState(future, callback)

        val prev = pendingGestureState.getAndSet(newState)
        if (prev != null && !prev.future.isDone) {
            pendingGestureState.set(prev)
            future.complete(false)
            return future
        }

        val targetPkg = rootInActiveWindow?.packageName?.toString()
        if (targetPkg != "ee.sk.smartid") {
            pendingGestureState.set(null)
            future.complete(false)
            return future
        }

        val gestureBuilder = GestureBuilder(opts)
        val built = gestureBuilder.build(coordinates)

        val dispatched = dispatchGesture(
            built.gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    callback(true)
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    callback(false)
                }
            },
            null,
        )

        if (!dispatched) {
            pendingGestureState.set(null)
            callback(false)
            return future
        }

        executionConfirmation.expectConfirmation()
        auditLogger.log(
            "gesture_dispatch",
            success = true,
            details = mapOf(
                "strokes" to "${coordinates.size / 2}",
                "duration_ms" to "${built.totalDurationMs}",
            ),
        )

        return future
    }

    fun analyzePinGrid(): GridInfo? {
        return pinGridAnalyzer.analyzeWithFallback()
    }

    fun executeWithErrorRecovery(
        coordinates: FloatArray,
        options: GestureOptions? = null,
    ): CompletableFuture<ErrorRecovery.RetryResult> {
        val opts = options ?: gestureOptions
        return errorRecovery.executeWithRetry(coordinates, opts) { coords ->
            executeGestureSequence(coords, opts)
        }.thenApply { result ->
            if (!result.success) {
                auditLogger.log(
                    "gesture_retry_exhausted",
                    success = false,
                    details = mapOf("attempts" to "${result.attemptsUsed}"),
                )
                fallbackCoordinator.onPersistentFailure()
            }
            result
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        executionConfirmation.onAccessibilityEvent(event)
    }

    override fun onInterrupt() {
        val state = pendingGestureState.getAndSet(null)
        state?.future?.complete(false)
    }

    override fun onPinEntrySuccess() {
        auditLogger.log("pin_entry_confirmed", success = true)
        notificationManager.dismissNotification()
    }

    override fun onPinEntryFailure(error: PinError) {
        auditLogger.log(
            "pin_entry_failed",
            success = false,
            details = mapOf("error" to error.name),
        )
    }

    override fun requestFallbackToManualInteraction() {
        auditLogger.log("fallback_webrtc", success = false)
    }

    private fun requestManualPhoneInteraction() {
        val state = pendingGestureState.getAndSet(null)
        state?.future?.complete(false)
    }

    private fun checkServiceStatus() {
        if (!setupGuide.isServiceEnabled()) {
            notificationManager.showServiceDisabledNotification()
        }
    }

    fun updateGestureOptions(options: GestureOptions) {
        gestureOptions = options.withAdaptiveTiming()
        GestureOptions.saveToPreferences(this, gestureOptions)
    }

    override fun onDestroy() {
        errorRecovery.close()
        super.onDestroy()
    }
}
