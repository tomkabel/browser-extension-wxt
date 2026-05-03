## Context

The Ghost Actuator is the V6's final execution layer. After the NDK enclave has transformed PIN digits into anonymous X/Y coordinates, the Ghost Actuator converts those coordinates into physical screen taps via `AccessibilityService.dispatchGesture()`. This achieves fully automated PIN entry into the Smart-ID app without ever storing or transmitting plaintext PIN data.

The Smart-ID app uses `FLAG_SECURE` which:
- Prevents screenshots and screen recording
- Makes `AccessibilityNodeInfo` text fields return empty content
- Blocks standard `performAction(ACTION_CLICK)` on some elements

`dispatchGesture()` bypasses these protections because it operates at the gesture injection level — the same level as a human finger touching the screen. The Smart-ID app cannot distinguish a `dispatchGesture` tap from a real finger tap.

## Goals / Non-Goals

**Goals:**
- `GhostActuatorService` — Android AccessibilityService binding for gesture injection
- Gesture sequence builder — `float[x,y][]` → `GestureDescription.StrokeDescription[]`
- PIN grid layout analyzer — Extract Smart-ID app button positions from Accessibility tree
- FLAG_SECURE window detection — Ensure gestures target the correct window
- Execution confirmation — Monitor screen state after gesture injection for success/failure
- Configurable tap timing (duration, inter-tap delay, retry delay)
- Error recovery — Retry on injection failure with adjusted coordinates

**Non-Goals:**
- PIN decryption (covered by `ndk-enclave-pin-vault`)
- zkTLS proof verification (Java Orchestrator layer)
- eIDAS QES hardware gate (covered by `eidas-qes-hardware-gate`)
- Credential management UI

## Decisions

### 1. GhostActuatorService Architecture

```kotlin
class GhostActuatorService : AccessibilityService() {
  private var gestureCallback: ((Boolean) -> Unit)? = null

  fun executeGestureSequence(
    coordinates: FloatArray,  // [x1, y1, x2, y2, ...]
    options: GestureOptions = GestureOptions()
  ): CompletableFuture<Boolean> {
    val future = CompletableFuture<Boolean>()
    gestureCallback = { success -> future.complete(success) }

    val builder = GestureDescription.Builder()
    for (i in coordinates.indices step 2) {
      val stroke = GestureDescription.StrokeDescription(
        Path().apply { moveTo(coordinates[i], coordinates[i + 1]) },
        0,                           // start time (immediate for first tap)
        options.tapDurationMs        // duration of each tap
      )
      builder.addStroke(stroke)
    }

    dispatchGesture(builder.build(), object : GestureResultCallback() {
      override fun onCompleted(gestureDescription: GestureDescription?) {
        gestureCallback?.invoke(true)
      }
      override fun onCancelled(gestureDescription: GestureDescription?) {
        gestureCallback?.invoke(false)
      }
    }, null)

    return future
  }
}
```

### 2. Gesture Sequence Builder

Each PIN digit becomes a tap stroke:

```
Timing:
  Tap 1: start=0ms, duration=50ms    (digit 1)
  Pause: 100ms
  Tap 2: start=150ms, duration=50ms  (digit 2)
  Pause: 100ms
  Tap 3: start=300ms, duration=50ms  (digit 3)
  ...

All taps are sequential (not parallel). Total time for a 4-digit PIN: 550ms.
For a 5-digit PIN2: 700ms.
```

Timing is configurable via `GestureOptions`:
```kotlin
data class GestureOptions(
  val tapDurationMs: Long = 50,
  val interTapDelayMs: Long = 100,
  val retryDelayMs: Long = 500,
  val maxRetries: Int = 2,
)
```

### 3. PIN Grid Analyzer

The analyzer walks the Accessibility tree of the foreground (Smart-ID) app to find the PIN grid:

```kotlin
class PinGridAnalyzer(private val service: AccessibilityService) {
  data class GridInfo(
    val centerPositions: List<Pair<Float, Float>>, // index 0-9 → digit 1-9,0
    val gridBounds: Rect,
    val appVersionCode: Int,
  )

  fun analyze(): GridInfo? {
    val root = service.rootInActiveWindow ?: return null
    // Find grid container by resource ID or content description
    val gridContainer = findGridContainer(root) ?: return null
    // Walk children to find digit buttons
    val digitButtons = mutableListOf<AccessibilityNodeInfo>()
    for (i in 0 until gridContainer.childCount) {
      val child = gridContainer.getChild(i)
      if (isDigitButton(child)) digitButtons.add(child)
    }
    // Sort by position and compute centers
    digitButtons.sortBy { it.boundsInScreen.top * 10000 + it.boundsInScreen.left }
    val centers = digitButtons.map {
      Pair(
        it.boundsInScreen.exactCenterX(),
        it.boundsInScreen.exactCenterY()
      )
    }
    return GridInfo(centers, gridContainer.boundsInScreen, getAppVersionCode())
  }
}
```

The grid is typically a 3×3 + 1 layout (digits 1-9, then 0 centered below). The analyzer must handle layout variations across Smart-ID app versions. It uses resource IDs (e.g., `com.smartid:id/keypad_*`) when available, falling back to position-based heuristics.

### 4. Execution Confirmation

After gesture injection, the actuator monitors the Accessibility event stream:

```kotlin
override fun onAccessibilityEvent(event: AccessibilityEvent) {
  when (event.eventType) {
    // PIN accepted → Smart-ID shows loading/processing screen
    AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
      if (isSmartIdProcessingScreen(event)) {
        actuatorCallback.onSuccess()
      }
    }
    // PIN rejected → error dialog
    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
      if (isPinErrorDialog(event)) {
        // Remove the rejected coordinate from cache
        actuatorCallback.onFailure(PinError.INCORRECT_PIN)
      }
    }
  }
}
```

If the PIN is rejected, the Ghost Actuator:
1. Reports failure to the Java Orchestrator
2. The Orchestrator decides: retry with same PIN (if hardware issue) or abort (if PIN wrong)
3. On abort, the user must manually intervene via the phone

### 5. Smart-ID App Binding

The Ghost Actuator must specifically target the Smart-ID app:
- Package name: `ee.sk.smartid` (or regional variant)
- Activity: The PIN entry activity (`SmartIdSignatureActivity` or similar)
- Detection: `rootInActiveWindow.packageName == "ee.sk.smartid"`

The actuator verifies the target package before executing any gesture to prevent tapjacking — it should never inject taps into a different app.

## Risks / Trade-offs

- [Risk] `dispatchGesture()` requires the user to enable AccessibilityService for the Vault app — Must guide users through Settings → Accessibility → SmartID Vault → Enable during setup
- [Risk] Smart-ID app redesigns the PIN grid — The PinGridAnalyzer must be version-aware; ship with known grid layouts, fall back to heuristic detection
- [Risk] FLAG_SECURE windows may not report grid AccessibilityNodeInfos — The analyzer uses raw screen bounds via `getWindowAnimationBounds` as fallback; worst case, use a hardcoded grid based on Smart-ID app version and screen resolution
- [Risk] `dispatchGesture()` may be slow on low-end devices (~200ms per tap) — Adjust interTapDelayMs based on device performance metrics
- [Risk] System overlays (battery saver, notification panel) can intercept gestures — Check `isScreenOn()` and no system dialog visible before injection
- [Trade-off] `dispatchGesture()` vs. `input tap` via ADB — ADB requires USB debugging enabled; dispatchGesture works without ADB and provides proper gesture timing
