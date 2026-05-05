package com.smartid.vault.ui.setup

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.smartid.vault.ghostactuator.GestureOptions

class SetupActivity : AppCompatActivity() {

    private lateinit var setupGuide: AccessibilitySetupGuide

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setupGuide = AccessibilitySetupGuide(this)

        if (!setupGuide.isServiceEnabled()) {
            showEnableServicePrompt()
        }
    }

    override fun onResume() {
        super.onResume()
        if (setupGuide.isServiceEnabled()) {
            onServiceEnabled()
        }
    }

    private fun showEnableServicePrompt() {
        setupGuide.openAccessibilitySettings()
    }

    private fun onServiceEnabled() {
        GestureOptions.fromPreferences(this)
    }
}
