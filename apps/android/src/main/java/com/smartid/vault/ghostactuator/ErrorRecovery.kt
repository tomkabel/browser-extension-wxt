package com.smartid.vault.ghostactuator

import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ThreadLocalRandom
import java.util.concurrent.TimeUnit

class ErrorRecovery(private val context: Context) {

    data class RetryResult(
        val success: Boolean,
        val finalCoordinates: FloatArray,
        val attemptsUsed: Int,
    )

    private companion object {
        private const val TAG = "ErrorRecovery"
        private const val SCREEN_CHECK_INTERVAL_MS = 500L
        private const val SCREEN_CHECK_MAX_RETRIES = 2
        private const val COORDINATE_JITTER_PX = 5f
    }

    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "ScreenCheckScheduler").apply { isDaemon = true }
    }

    fun executeWithRetry(
        coordinates: FloatArray,
        options: GestureOptions,
        injectFn: (FloatArray) -> CompletableFuture<Boolean>,
    ): CompletableFuture<RetryResult> {
        return checkScreenReady(options)
            .thenCompose { screenReady ->
                if (!screenReady) {
                    return@thenCompose CompletableFuture.completedFuture(
                        RetryResult(false, coordinates, 0)
                    )
                }
                attemptInjection(coordinates, options, injectFn, 0)
            }
    }

    private fun checkScreenReady(options: GestureOptions): CompletableFuture<Boolean> {
        val future = CompletableFuture<Boolean>()
        pollScreenReady(0, future)
        return future
    }

    private fun pollScreenReady(attempt: Int, future: CompletableFuture<Boolean>) {
        if (isScreenReady()) {
            future.complete(true)
        } else if (attempt >= SCREEN_CHECK_MAX_RETRIES) {
            future.complete(false)
        } else {
            scheduler.schedule(
                { pollScreenReady(attempt + 1, future) },
                SCREEN_CHECK_INTERVAL_MS,
                TimeUnit.MILLISECONDS,
            )
        }
    }

    fun isScreenReady(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        if (!pm.isInteractive) return false

        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager ?: return true
        if (km.isKeyguardLocked) return false

        return true
    }

    private fun attemptInjection(
        coordinates: FloatArray,
        options: GestureOptions,
        injectFn: (FloatArray) -> CompletableFuture<Boolean>,
        attempt: Int,
    ): CompletableFuture<RetryResult> {
        val adjustedCoords = if (attempt > 0) {
            adjustCoordinates(coordinates, attempt)
        } else {
            coordinates
        }

        return injectFn(adjustedCoords)
            .handle<Boolean> { result, error ->
                if (error != null) {
                    Log.w(TAG, "Injection attempt $attempt failed", error)
                    false
                } else {
                    result
                }
            }
            .thenCompose { success ->
                if (success) {
                    CompletableFuture.completedFuture(
                        RetryResult(true, adjustedCoords, attempt + 1)
                    )
                } else if (attempt < options.maxRetries) {
                    CompletableFuture.runAsync {
                        SystemClock.sleep(options.retryDelayMs)
                    }.thenCompose {
                        attemptInjection(coordinates, options, injectFn, attempt + 1)
                    }
                } else {
                    CompletableFuture.completedFuture(
                        RetryResult(false, adjustedCoords, attempt + 1)
                    )
                }
            }
    }

    fun adjustCoordinates(
        coordinates: FloatArray,
        attempt: Int,
    ): FloatArray {
        val rng = ThreadLocalRandom.current()
        return FloatArray(coordinates.size) { i ->
            val jitter = rng.nextFloat() * 2 * COORDINATE_JITTER_PX - COORDINATE_JITTER_PX
            coordinates[i] + jitter
        }
    }
}
