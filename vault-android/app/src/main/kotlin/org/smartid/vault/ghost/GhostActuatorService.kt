package org.smartid.vault.ghost

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
class GhostActuatorService : AccessibilityService() {

    private var sequenceToken = 0
    private var preparedSequence: List<Coordinate>? = null
    private var isHeld = false
    private var awaitingForeground = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        GhostActuatorBridge.bind(this)
        Log.i(TAG, "GhostActuatorService created and bound to bridge")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val packageName = event.packageName?.toString() ?: return

        if (packageName in ALLOWED_PACKAGES) {
            if (awaitingForeground && isHeld && preparedSequence != null) {
                Log.i(TAG, "Smart-ID foregrounded while sequence held, notifying bridge")
                awaitingForeground = false
                sendBroadcast(Intent(ACTION_SMARTID_FOREGROUND).setPackage(applicationContext.packageName))
            }
            return
        }

        if (awaitingForeground) {
            Log.d(TAG, "Non-Smart-ID package ($packageName) while awaiting foreground, holding sequence")
            return
        }

        if (preparedSequence != null || isHeld) {
            clearSequence()
            Log.w(TAG, "Foreground app not in whitelist, sequence cleared")
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
        val executionToken = ++sequenceToken
        Log.i(TAG, "Executing held gesture sequence (${sequence.size} taps) [token=$executionToken]")

        executeTapsWithDelay(sequence, 0, executionToken)
    }

    fun clearSequence() {
        ++sequenceToken
        mainHandler.removeCallbacksAndMessages(null)
        preparedSequence = null
        isHeld = false
        awaitingForeground = false
        Log.i(TAG, "Gesture sequence cleared [sequenceToken=$sequenceToken]")
    }

    fun setAwaitingForeground(awaiting: Boolean) {
        awaitingForeground = awaiting
        Log.i(TAG, "Awaiting foreground set to $awaiting")
    }

    private fun executeTapsWithDelay(coordinates: List<Coordinate>, index: Int, token: Int) {
        if (index >= coordinates.size) {
            if (token == sequenceToken) {
                Log.i(TAG, "Gesture sequence complete")
                GhostActuatorBridge.notifyCompleted()
            }
            return
        }

        if (token != sequenceToken) return

        val coord = coordinates[index]
        val tapDuration = GhostActuatorBridge.humanDelayMs(BASE_TAP_DURATION_MS)
        val gesture = buildTapGesture(coord.x, coord.y, tapDuration)

        val dispatched = dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                if (token != sequenceToken) return
                Log.d(TAG, "Tap $index completed at (${coord.x}, ${coord.y})")
                val interTapDelay = GhostActuatorBridge.humanDelayMs(INTER_TAP_DELAY_BASE_MS)
                mainHandler.postDelayed({
                    executeTapsWithDelay(coordinates, index + 1, token)
                }, interTapDelay)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                if (token != sequenceToken) return
                Log.w(TAG, "Tap $index cancelled")
                GhostActuatorBridge.notifyFailed(index)
            }
        }, null)

        if (!dispatched) {
            Log.w(TAG, "Tap $index rejected by dispatchGesture")
            GhostActuatorBridge.notifyFailed(index)
        }
    }

    private fun buildTapGesture(x: Float, y: Float, durationMs: Long): GestureDescription {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        return GestureDescription.Builder().apply { addStroke(stroke) }.build()
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
        const val ACTION_SMARTID_FOREGROUND = "org.smartid.vault.action.SMARTID_FOREGROUND"
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

        fun setAwaitingForeground(context: Context, awaiting: Boolean) {
            GhostActuatorBridge.setAwaitingForeground(awaiting)
        }
    }
}
