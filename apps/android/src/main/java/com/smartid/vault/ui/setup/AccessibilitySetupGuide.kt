package com.smartid.vault.ui.setup

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager

class AccessibilitySetupGuide(private val context: Context) {

    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    fun isServiceEnabled(): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            ?: return false

        val enabledServices = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_GENERIC
        )

        return enabledServices.any { service ->
            service.resolveInfo.serviceInfo.packageName == context.packageName
        }
    }

    fun getServiceStatus(): ServiceStatus {
        return if (isServiceEnabled()) {
            ServiceStatus.ENABLED
        } else {
            ServiceStatus.DISABLED
        }
    }

    enum class ServiceStatus {
        ENABLED,
        DISABLED,
    }
}
