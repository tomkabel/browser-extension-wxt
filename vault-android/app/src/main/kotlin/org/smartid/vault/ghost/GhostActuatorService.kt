package org.smartid.vault.ghost

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class GhostActuatorService : AccessibilityService() {

    private var preparedSequence: List<Coordinate>? = null
    private var isHeld = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        GhostActuatorBridge.bind(this)
        Log.i(TAG, "GhostActuatorService created and bound to bridge")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        if (!validateForegroundPackage(event)) {
            clearSequence()
            Log.w(TAG, "Foreground app not in whitelist, sequence cleared")
            return
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService interrupted")
        clearSequence()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HOLD -> {
                val coords = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableArrayListExtra(EXTRA_COORDINATES, Coordinate::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableArrayListExtra(EXTRA_COORDINATES)
                }
                if (coords != null && coords.isNotEmpty()) {
                    holdSequence(coords)
                }
            }
            ACTION_EXECUTE -> {
                executeSequence()
            }
            ACTION_CLEAR -> {
                clearSequence()
            }
        }
        return START_NOT_STICKY
    }

    fun holdSequence(coordinates: List<Coordinate>) {
        if (!isGestureCapabilityAvailable()) {
            Log.w(TAG, "Cannot perform gestures, sequence rejected")
            return
        }
        preparedSequence = coordinates.toList()
        isHeld = true
        Log.i(TAG, "Gesture sequence held (${coordinates.size} taps)")
    }

    fun executeSequence() {
        val sequence = preparedSequence
        if (sequence == null) {
            Log.w(TAG, "No prepared sequence to execute")
            GhostActuatorBridge.notifyFailed(-1)
            return
        }
        if (!isHeld) {
            Log.w(TAG, "Sequence was not held, ignoring execute")
            GhostActuatorBridge.notifyFailed(-1)
            return
        }

        isHeld = false
        preparedSequence = null
        Log.i(TAG, "Executing held gesture sequence (${sequence.size} taps)")

        executeTapsWithDelay(sequence, 0)
    }

    fun clearSequence() {
        preparedSequence = null
        isHeld = false
        Log.i(TAG, "Gesture sequence cleared")
    }

    private fun executeTapsWithDelay(coordinates: List<Coordinate>, index: Int) {
        if (index >= coordinates.size) {
            Log.i(TAG, "Gesture sequence complete")
            GhostActuatorBridge.notifyCompleted()
            return
        }

        val coord = coordinates[index]
        val tapDuration = GhostActuatorBridge.humanDelayMs(BASE_TAP_DURATION_MS)
        val gesture = buildTapGesture(coord.x, coord.y, tapDuration)

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "Tap $index completed at (${coord.x}, ${coord.y})")
                val interTapDelay = GhostActuatorBridge.humanDelayMs(INTER_TAP_DELAY_BASE_MS)
                mainHandler.postDelayed({
                    executeTapsWithDelay(coordinates, index + 1)
                }, interTapDelay)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "Tap $index cancelled")
                GhostActuatorBridge.notifyFailed(index)
            }
        }, null)
    }

    private fun buildTapGesture(x: Float, y: Float, durationMs: Long): GestureDescription {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        return GestureDescription.Builder().apply { addStroke(stroke) }.build()
    }

    private fun validateForegroundPackage(event: AccessibilityEvent): Boolean {
        val packageName = event.packageName?.toString() ?: return true
        if (packageName in ALLOWED_PACKAGES) return true
        Log.w(TAG, "Event from non-whitelisted package: $packageName")
        return false
    }

    private fun isGestureCapabilityAvailable(): Boolean {
        if (!canPerformGestures()) {
            Log.e(TAG, "Device does not support gesture injection")
            return false
        }
        return true
    }

    override fun onDestroy() {
        GhostActuatorBridge.unbind()
        clearSequence()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "GhostActuatorService"
        private const val BASE_TAP_DURATION_MS = 120L
        private const val INTER_TAP_DELAY_BASE_MS = 150L

        val ALLOWED_PACKAGES = setOf("ee.sk.smartid")

        const val ACTION_HOLD = "org.smartid.vault.action.HOLD_SEQUENCE"
        const val ACTION_EXECUTE = "org.smartid.vault.action.EXECUTE_SEQUENCE"
        const val ACTION_CLEAR = "org.smartid.vault.action.CLEAR_SEQUENCE"
        const val EXTRA_COORDINATES = "coordinates"

        fun holdSequence(context: Context, coordinates: ArrayList<Coordinate>) {
            val intent = Intent(context, GhostActuatorService::class.java).apply {
                action = ACTION_HOLD
                putParcelableArrayListExtra(EXTRA_COORDINATES, coordinates)
            }
            context.startService(intent)
        }

        fun executeSequence(context: Context) {
            val intent = Intent(context, GhostActuatorService::class.java).apply {
                action = ACTION_EXECUTE
            }
            context.startService(intent)
        }

        fun clearSequence(context: Context) {
            val intent = Intent(context, GhostActuatorService::class.java).apply {
                action = ACTION_CLEAR
            }
            context.startService(intent)
        }
    }
}
