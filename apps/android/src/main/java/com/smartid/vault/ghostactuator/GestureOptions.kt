package com.smartid.vault.ghostactuator

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Debug

data class GestureOptions(
    val tapDurationMs: Long = 50L,
    val interTapDelayMs: Long = 100L,
    val retryDelayMs: Long = 500L,
    val maxRetries: Int = 2,
) {
    companion object {
        private const val PREFS_NAME = "gesture_settings"
        private const val KEY_TAP_DURATION = "tap_duration_ms"
        private const val KEY_INTER_TAP_DELAY = "inter_tap_delay_ms"
        private const val KEY_RETRY_DELAY = "retry_delay_ms"
        private const val KEY_MAX_RETRIES = "max_retries"

        fun fromPreferences(context: Context): GestureOptions {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return GestureOptions(
                tapDurationMs = prefs.getString(KEY_TAP_DURATION, "50")?.toLongOrNull()?.coerceIn(10L, 500L) ?: 50L,
                interTapDelayMs = prefs.getString(KEY_INTER_TAP_DELAY, "100")?.toLongOrNull()?.coerceIn(20L, 1000L) ?: 100L,
                retryDelayMs = prefs.getString(KEY_RETRY_DELAY, "500")?.toLongOrNull()?.coerceIn(100L, 3000L) ?: 500L,
                maxRetries = prefs.getString(KEY_MAX_RETRIES, "2")?.toIntOrNull()?.coerceIn(0, 10) ?: 2,
            )
        }

        fun saveToPreferences(context: Context, options: GestureOptions) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_TAP_DURATION, options.tapDurationMs.toString())
                .putString(KEY_INTER_TAP_DELAY, options.interTapDelayMs.toString())
                .putString(KEY_RETRY_DELAY, options.retryDelayMs.toString())
                .putString(KEY_MAX_RETRIES, options.maxRetries.toString())
                .apply()
        }
    }

    fun withAdaptiveTiming(): GestureOptions {
        val cpuCount = Runtime.getRuntime().availableProcessors()
        val isLowEnd = cpuCount <= 4 || Debug.isNativeLoadInProgress()

        val baseDelay = when {
            isLowEnd -> 200L
            cpuCount <= 6 -> 150L
            else -> 100L
        }

        val baseDuration = when {
            isLowEnd -> 80L
            else -> 50L
        }

        val adjustedDelay = maxOf(interTapDelayMs, baseDelay)
        val adjustedDuration = maxOf(tapDurationMs, baseDuration)

        return copy(
            interTapDelayMs = adjustedDelay,
            tapDurationMs = adjustedDuration,
        )
    }
}
