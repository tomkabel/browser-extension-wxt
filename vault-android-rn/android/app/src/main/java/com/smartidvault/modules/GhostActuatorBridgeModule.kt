package com.smartidvault.modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.smartid.vault.ghost.Coordinate
import org.smartid.vault.ghost.GhostActuatorBridge
import org.smartid.vault.ghost.GhostActuatorService

class GhostActuatorBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "GhostActuatorBridge"

    private var foregroundReceiver: BroadcastReceiver? = null
    private var foregroundTimeoutHandler: Handler? = null
    private var foregroundTimeoutRunnable: Runnable? = null
    private var foregroundPromise: Promise? = null

    @ReactMethod
    fun holdSequence(coordinates: ReadableArray, promise: Promise) {
        try {
            val coords = ArrayList<Coordinate>()
            for (i in 0 until coordinates.size) {
                val map = coordinates.getMap(i)
                val x = (map.getDouble("x")).toFloat()
                val y = (map.getDouble("y")).toFloat()
                coords.add(Coordinate(x, y))
            }

            if (coords.isEmpty()) {
                promise.reject("GHOST_ERROR", "Empty coordinate array")
                return
            }

            val intent = Intent(reactContext, GhostActuatorService::class.java).apply {
                action = GhostActuatorService.ACTION_HOLD
                putParcelableArrayListExtra(GhostActuatorService.EXTRA_COORDINATES, coords)
            }
            reactContext.startService(intent)
            Log.i(TAG, "Hold sequence sent: ${coords.size} coordinates")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to hold sequence", e)
            promise.reject("GHOST_ERROR", "Failed to hold sequence: ${e.message}", e)
        }
    }

    @ReactMethod
    fun executeSequence(promise: Promise) {
        try {
            val intent = Intent(reactContext, GhostActuatorService::class.java).apply {
                action = GhostActuatorService.ACTION_EXECUTE
            }
            reactContext.startService(intent)
            Log.i(TAG, "Execute sequence sent")

            GhostActuatorBridge.setOnCompleted {
                Log.i(TAG, "Gesture sequence completed")
                sendEvent("GhostActuatorCompleted", null)
            }
            GhostActuatorBridge.setOnFailed { failedIndex ->
                Log.w(TAG, "Gesture sequence failed at index $failedIndex")
                val params = Arguments.createMap().apply {
                    putInt("failedIndex", failedIndex)
                    putString("error", "tap_failed")
                }
                sendEvent("GhostActuatorFailed", params)
            }

            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to execute sequence", e)
            promise.reject("GHOST_ERROR", "Failed to execute sequence: ${e.message}", e)
        }
    }

    @ReactMethod
    fun clearSequence(promise: Promise) {
        try {
            cleanupForegroundWait()

            val intent = Intent(reactContext, GhostActuatorService::class.java).apply {
                action = GhostActuatorService.ACTION_CLEAR
            }
            reactContext.startService(intent)
            Log.i(TAG, "Clear sequence sent")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear sequence", e)
            promise.reject("GHOST_ERROR", "Failed to clear sequence: ${e.message}", e)
        }
    }

    @ReactMethod
    fun awaitForegroundAndExecute(timeoutMs: Double, promise: Promise) {
        cleanupForegroundWait()

        val timeout = timeoutMs.toLong()
        foregroundPromise = promise
        foregroundTimeoutHandler = Handler(Looper.getMainLooper())

        GhostActuatorBridge.setAwaitingForeground(true)

        foregroundReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                Log.i(TAG, "Smart-ID foreground broadcast received, executing sequence")
                cleanupForegroundWait()

                val execIntent = Intent(reactContext, GhostActuatorService::class.java).apply {
                    action = GhostActuatorService.ACTION_EXECUTE
                }
                reactContext.startService(execIntent)

                GhostActuatorBridge.setOnCompleted {
                    sendEvent("GhostActuatorCompleted", null)
                    foregroundPromise?.resolve(null)
                    foregroundPromise = null
                }
                GhostActuatorBridge.setOnFailed { failedIndex ->
                    val params = Arguments.createMap().apply {
                        putInt("failedIndex", failedIndex)
                        putString("error", "tap_failed")
                    }
                    sendEvent("GhostActuatorFailed", params)
                    foregroundPromise?.reject("GHOST_ERROR", "Tap failed at index $failedIndex")
                    foregroundPromise = null
                }
            }
        }

        val filter = IntentFilter(GhostActuatorService.ACTION_SMARTID_FOREGROUND)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(foregroundReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(foregroundReceiver, filter)
        }

        foregroundTimeoutRunnable = Runnable {
            Log.w(TAG, "Foreground wait timed out after ${timeout}ms")
            cleanupForegroundWait()
            GhostActuatorBridge.clearSequence()
            foregroundPromise?.reject(
                "GHOST_TIMEOUT",
                "Smart-ID app did not come to foreground within ${timeout}ms"
            )
            foregroundPromise = null
        }
        foregroundTimeoutHandler?.postDelayed(foregroundTimeoutRunnable!!, timeout)

        Log.i(TAG, "Awaiting Smart-ID foreground (timeout=${timeout}ms)")
    }

    private fun cleanupForegroundWait() {
        GhostActuatorBridge.setAwaitingForeground(false)

        foregroundTimeoutRunnable?.let {
            foregroundTimeoutHandler?.removeCallbacks(it)
        }
        foregroundTimeoutHandler = null
        foregroundTimeoutRunnable = null

        foregroundReceiver?.let {
            try {
                reactContext.unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
                // Already unregistered
            }
        }
        foregroundReceiver = null
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    companion object {
        private const val TAG = "GhostActuatorBridge"
    }
}
