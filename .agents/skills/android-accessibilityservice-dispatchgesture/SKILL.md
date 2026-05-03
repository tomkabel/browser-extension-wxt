---
name: android-accessibilityservice-dispatchgesture
description: Android AccessibilityService dispatchGesture for Ghost Actuator gesture injection. Covers GestureDescription.Builder, Path and StrokeDescription construction, timing and duration, callback monitoring, privilege escalation risks, handling canPerformGesture checks, and coordinate mapping from PIN digits to screen X/Y.
---

# Android AccessibilityService — `dispatchGesture` (Ghost Actuator)

## When to Use

Apply this skill when:
- Implementing Phase 2/V6 Ghost Actuator for blind PIN entry into the Smart-ID app
- Reviewing `openspec/changes/ghost-actuator-gesture-injection/`
- Understanding why AccessibilityService is the only viable injection path for third-party app interaction
- Hardening against privilege escalation or overlay abuse

## Overview

The **Ghost Actuator** injects synthetic touch gestures into the Android Smart-ID app using `AccessibilityService.dispatchGesture()`. This allows the phone to enter its own PIN into the Smart-ID app **without the PIN ever entering the JVM heap** or being visible to keyboard interceptors.

Why not `InputManager.injectInputEvent`? It requires `INJECT_EVENTS` signature permission (system apps only). `dispatchGesture` is the only API available to third-party apps with `BIND_ACCESSIBILITY_SERVICE`.

## Declaring the Service

```xml
<!-- AndroidManifest.xml -->
<service
    android:name=".service.GhostActuatorService"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService"/>
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/ghost_actuator_config"/>
</service>
```

```xml
<!-- res/xml/ghost_actuator_config.xml -->
<accessibility-service
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagReportViewIds"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:description="@string/ghost_actuator_desc"
    android:notificationTimeout="100"
    android:settingsActivity=".settings.GhostActuatorSettings"/>
```

**Critical**: `android:canPerformGestures="true"` is required. Without it, `dispatchGesture` returns `false` immediately.

## GestureDescription.Builder

```kotlin
// service/GhostActuatorService.kt
class GhostActuatorService : AccessibilityService() {

    data class Point(val x: Float, val y: Float)

    fun tapAt(point: Point, durationMs: Long = 50L): Boolean {
        val path = Path().apply {
            moveTo(point.x, point.y)
        }

        val stroke = GestureDescription.StrokeDescription(
            path,
            0,               // startTime
            durationMs,      // duration
            false            // willContinue (false = single tap)
        )

        val gesture = GestureDescription.Builder()
            .addStroke(stroke)
            .build()

        return dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                // Gesture succeeded — safe to proceed to next digit
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                // Gesture was interrupted (screen off, permission revoked, etc.)
                // Retry or abort
            }
        }, null)
    }
}
```

## Multi-Stroke PIN Entry Sequence

Smart-ID uses a 5-digit PIN. The Ghost Actuator must tap each digit in sequence with human-like timing:

```kotlin
class GhostActuatorService : AccessibilityService() {

    private val executor = Handler(Looper.getMainLooper())

    fun enterPin(digits: List<Int>, keypadCoordinates: Map<Int, Point>): Flow<GhostActResult> = callbackFlow {
        if (!canPerformGestures()) {
            trySend(GhostActResult.Error("CANNOT_PERFORM_GESTURES"))
            close()
            return@callbackFlow
        }

        val interval = Random.nextLong(120, 280) // human-like jitter between taps

        digits.forEachIndexed { index, digit ->
            val coord = keypadCoordinates[digit]
                ?: run {
                    trySend(GhostActResult.Error("UNKNOWN_DIGIT_$digit"))
                    close()
                    return@callbackFlow
                }

            executor.postDelayed({
                val success = tapAt(coord, durationMs = Random.nextLong(40, 80))
                if (!success) {
                    trySend(GhostActResult.Error("GESTURE_DISPATCH_FAILED"))
                    close()
                    return@postDelayed
                }
                trySend(GhostActResult.DigitEntered(digit))

                if (index == digits.lastIndex) {
                    trySend(GhostActResult.Completed)
                    close()
                }
            }, index * interval)
        }

        awaitClose()
    }
}
```

## Coordinate Mapping from PIN Digits to Screen X/Y

Smart-ID uses a dynamic keypad (digits shuffle every time). The Ghost Actuator must resolve digit locations using `AccessibilityNodeInfo`:

```kotlin
fun findKeypadCoordinates(root: AccessibilityNodeInfo?): Map<Int, Point> {
    root ?: return emptyMap()

    val coordinates = mutableMapOf<Int, Point>()
    val nodes = root.findAccessibilityNodeInfosByViewId("ee.smartid:id/pinKey") // hypothetical ID

    for (node in nodes) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val centerX = bounds.centerX().toFloat()
        val centerY = bounds.centerY().toFloat()

        // Extract digit label from contentDescription or text
        val label = node.contentDescription?.toString() ?: node.text?.toString()
        val digit = label?.toIntOrNull()
        if (digit != null) {
            coordinates[digit] = Point(centerX, centerY)
        }
    }
    return coordinates
}
```

**Fallback** (if view IDs are unavailable): Use OCR via ML Kit on a screenshot taken via `MediaProjection`. This is slower but works against obfuscated apps.

## Continuous Gesture (Swipe / Drag)

For apps requiring swipe gestures (e.g., pattern unlock):

```kotlin
fun swipe(from: Point, to: Point, durationMs: Long = 300L): Boolean {
    val path = Path().apply {
        moveTo(from.x, from.y)
        lineTo(to.x, to.y)
    }

    val stroke = GestureDescription.StrokeDescription(path, 0, durationMs, false)
    val gesture = GestureDescription.Builder().addStroke(stroke).build()
    return dispatchGesture(gesture, null, null)
}
```

For multi-segment gestures (e.g., pattern lock with intermediate points), use `StrokeDescription.continueStroke()`:

```kotlin
val stroke1 = GestureDescription.StrokeDescription(path1, 0, 200, true) // willContinue = true
val stroke2 = stroke1.continueStroke(path2, 0, 200, true)
val stroke3 = stroke2.continueStroke(path3, 0, 200, false)

val gesture = GestureDescription.Builder()
    .addStroke(stroke1)
    .build()
// Note: continueStroke is added implicitly by the framework
```

## Privilege Escalation & Security Risks

`dispatchGesture` is an **extremely powerful API**:
- Can tap any UI element, including "Install" buttons on system dialogs
- Can bypass per-app confirmation dialogs
- Can interact with the lock screen on some OEM skins

**Mitigations in SmartID2**:
1. **Service whitelist**: Only respond to `packageName == "ee.smartid"`
2. **Window focus validation**: Verify the top window belongs to Smart-ID before injecting
3. **Gesture rate limiting**: Max 1 gesture per second to prevent automated exploitation
4. **User consent**: Require explicit toggle in Android app settings with warning
5. **No remote trigger**: The gesture sequence is computed locally on the phone from a Noise-encrypted payload; the laptop never sends raw coordinates

```kotlin
override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        val packageName = event.packageName?.toString() ?: return
        if (packageName != TARGET_PACKAGE) {
            isTargetFocused = false
            return
        }
        isTargetFocused = true
        // Pre-compute keypad coordinates for faster injection
        keypadCoordinates = findKeypadCoordinates(rootInActiveWindow)
    }
}
```

## Handling `canPerformGesture` Checks

```kotlin
fun ensureGestureCapability(): Boolean {
    if (!canPerformGestures()) {
        // Guide user to enable gesture permission in Accessibility settings
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(intent)
        return false
    }
    return true
}
```

On Android 14+, `canPerformGestures()` may return `false` even if declared, if the user has revoked the permission via Settings > Apps > Special app access.

## Common Pitfalls

1. **Screen must be on**: `dispatchGesture` silently fails if the screen is off. Use `PowerManager.WakeLock` or trigger a notification to wake the device.
2. **Coordinate system**: `getBoundsInScreen()` uses absolute screen coordinates, including status bar. If immersive mode changes, recalculate.
3. **Gesture cancellation**: Rapid successive gestures may cancel earlier ones if the first hasn't completed. Wait for `onCompleted` before dispatching the next.
4. **Memory leaks**: `AccessibilityNodeInfo` objects must be recycled: `node.recycle()`.
5. **Service binding race**: `onServiceConnected` may fire before the UI is ready. Defer gesture dispatch until the service reports `isTargetFocused == true`.

## References

- [Android AccessibilityService.dispatchGesture](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#dispatchGesture(android.accessibilityservice.GestureDescription,%20android.accessibilityservice.AccessibilityService.GestureResultCallback,%20android.os.Handler))
- `openspec/changes/ghost-actuator-gesture-injection/`
- `SMARTID_VAULT_v6.md` — Phase 2 actuator architecture
