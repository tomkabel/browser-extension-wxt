package org.smartid.vault.haptic

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

class HapticNotifier(private val context: Context) {

    private var vibrator: Vibrator? = null

    init {
        vibrator = resolveVibrator()
    }

    fun startSosHaptic() {
        val vib = vibrator ?: run {
            Log.w(TAG, "Vibrator not available, skipping SOS haptic")
            return
        }

        val pattern = SOS_PATTERN.copyOf()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createWaveform(pattern, 0)
            vib.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(pattern, 0)
        }
        Log.i(TAG, "SOS haptic pattern started")
    }

    fun stopSosHaptic() {
        vibrator?.cancel()
        Log.i(TAG, "SOS haptic stopped")
    }

    private fun resolveVibrator(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(VibratorManager::class.java)
            manager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    companion object {
        private const val TAG = "HapticNotifier"

        val SOS_PATTERN: LongArray = longArrayOf(
            0L,     // start immediately
            500L,   // LONG vibration
            200L,   // pause
            500L,   // LONG vibration
            200L,   // pause
            500L,   // LONG vibration
            1000L,  // long pause (end of first S-O-S cycle)
            200L,   // SHORT
            200L,   // pause
            200L,   // SHORT
            200L,   // pause
            200L,   // SHORT
            1000L,  // long pause
            500L,   // LONG vibration
            200L,   // pause
            500L,   // LONG vibration
            200L,   // pause
            500L,   // LONG vibration
        )
    }
}
