package com.smartid.vault.ghostactuator

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.smartid.vault.audit.AuditLogger
import com.smartid.vault.ghostactuator.orchestrator.OrchestratorInterface
import com.smartid.vault.ghostactuator.orchestrator.PinError

class ExecutionConfirmation(
    private val orchestrator: OrchestratorInterface,
    private val auditLogger: AuditLogger,
) {
    private var pendingConfirmation = false

    fun expectConfirmation() {
        pendingConfirmation = true
    }

    fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (!pendingConfirmation) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (isSmartIdProcessingScreen(event)) {
                    pendingConfirmation = false
                    auditLogger.log("pin_entry", success = true)
                    orchestrator.onPinEntrySuccess()
                }
            }

            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                if (isPinErrorDialog(event)) {
                    pendingConfirmation = false
                    auditLogger.log(
                        "pin_entry",
                        success = false,
                        details = mapOf("reason" to "incorrect_pin"),
                    )
                    orchestrator.onPinEntryFailure(PinError.INCORRECT_PIN)
                }
            }
        }
    }

    private fun isSmartIdProcessingScreen(event: AccessibilityEvent): Boolean {
        val pkg = event.packageName?.toString() ?: return false
        if (pkg != SMART_ID_PACKAGE) return false

        val className = event.className?.toString() ?: return false

        val processingIndicators = listOf(
            "ProcessingActivity",
            "SignatureActivity",
            "LoadingActivity",
        )
        return processingIndicators.any { className.contains(it) }
    }

    private fun isPinErrorDialog(event: AccessibilityEvent): Boolean {
        val pkg = event.packageName?.toString() ?: return false
        if (pkg != SMART_ID_PACKAGE) return false

        val text = event.text?.joinToString("") ?: return false

        val errorIndicators = listOf(
            "wrong PIN",
            "invalid PIN",
            "PIN kood",
            "vale PIN",
            "incorrect PIN",
            "incorrect pin",
        )
        return errorIndicators.any { text.contains(it, ignoreCase = true) }
    }

    fun abort() {
        if (!pendingConfirmation) return
        pendingConfirmation = false
        auditLogger.log(
            "pin_entry",
            success = false,
            details = mapOf("reason" to "manual_abort"),
        )
        orchestrator.onPinEntryFailure(PinError.MANUAL_ABORT)
        orchestrator.requestFallbackToManualInteraction()
    }

    companion object {
        private const val SMART_ID_PACKAGE = "ee.sk.smartid"
    }
}
