package com.smartid.vault.ghostactuator

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.GestureDescription
import com.smartid.vault.audit.AuditLogger
import com.smartid.vault.ghostactuator.orchestrator.OrchestratorInterface
import com.smartid.vault.ghostactuator.orchestrator.PinError
import com.smartid.vault.ui.setup.AccessibilitySetupGuide
import com.smartid.vault.ui.setup.ServiceNotificationManager
import java.util.concurrent.CompletableFuture

class GhostActuatorService : AccessibilityService(), OrchestratorInterface {

    private lateinit var pinGridAnalyzer: PinGridAnalyzer
    private lateinit var gestureOptions: GestureOptions
    private lateinit var errorRecovery: ErrorRecovery
    private lateinit var executionConfirmation: ExecutionConfirmation
    private lateinit var fallbackCoordinator: FallbackCoordinator
    private lateinit var auditLogger: AuditLogger
    private lateinit var setupGuide: AccessibilitySetupGuide
    private lateinit var notificationManager: ServiceNotificationManager

    private var pendingGestureFuture: CompletableFuture<Boolean>? = null
    private var gestureCallback: ((Boolean) -> Unit)? = null

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

        val targetPkg = rootInActiveWindow?.packageName?.toString()
        if (targetPkg != "ee.sk.smartid") {
            future.complete(false)
            return future
        }

        pendingGestureFuture = future
        gestureCallback = { success -> future.complete(success) }

        val gestureBuilder = GestureBuilder(opts)
        val built = gestureBuilder.build(coordinates)

        executionConfirmation.expectConfirmation()
        auditLogger.log(
            "gesture_dispatch",
            success = true,
            details = mapOf(
                "strokes" to "${coordinates.size / 2}",
                "duration_ms" to "${built.totalDurationMs}",
            ),
        )

        dispatchGesture(
            built.gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    gestureCallback?.invoke(true)
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    gestureCallback?.invoke(false)
                }
            },
            null,
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
        pendingGestureFuture?.complete(false)
        pendingGestureFuture = null
        gestureCallback = null
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
        pendingGestureFuture?.complete(false)
        pendingGestureFuture = null
        gestureCallback = null
    }

    private fun checkServiceStatus() {
        if (!setupGuide.isServiceEnabled()) {
            notificationManager.showServiceDisabledNotification()
        }
    }

    fun updateGestureOptions(options: GestureOptions) {
        gestureOptions = options.withAdaptiveTiming()
        GestureOptions.saveToPreferences(this, options)
    }
}
