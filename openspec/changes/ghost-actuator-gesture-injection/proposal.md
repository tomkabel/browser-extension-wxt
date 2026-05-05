## Why

The Smart-ID app uses `FLAG_SECURE` on its window, which prevents standard Accessibility node injection (`ACTION_CLICK`) on text fields and blocks screenshot/screen-recording. This is a security feature that protects the PIN entry UI, but it also means conventional automation approaches (uiautomator, Accessibility `performAction`) are unreliable and may leak data through Binder IPC.

V6's Ghost Actuator solves this with "Blind Actuation": instead of interacting with semantic UI nodes, it uses `AccessibilityService.dispatchGesture()` to simulate human finger taps at precise X/Y coordinates. The PIN digits have already been transformed into anonymous coordinates by the NDK enclave — the actuator has no knowledge of which digit corresponds to which coordinate. This achieves robotic automation with zero plaintext secrets in any IPC buffer or memory region.

## What Changes

- **GhostActuatorService**: Android `AccessibilityService` implementation that:
  - Receives `float[x, y]` coordinate arrays from the NDK enclave bridge
  - Constructs `GestureDescription.StrokeDescription` for each coordinate
  - Calls `dispatchGesture()` with the complete gesture sequence
  - Reports completion/failure back to the Java Orchestrator
- **Gesture Sequence Builder**: Converts the coordinate array into a time-ordered tap sequence. Each tap includes:
  - Start X/Y (float precision)
  - End X/Y (same as start for tap; different for swipe)
  - Duration (configurable, default 50ms per tap)
  - Inter-tap delay (configurable, default 100ms)
- **PIN Grid Layout Analyzer**: Before enclave invocation, analyzes the Smart-ID app's PIN grid using Accessibility node tree to determine:
  - Grid position (center X/Y of each digit button)
  - Grid dimensions (3x3 + 0, or 4x3, etc.)
  - Button sizes for hit-target verification
- **FLAG_SECURE Bypass Detection**: Monitors that gesture injection is actually reaching the FLAG_SECURE window. If the overlay or keyboard blocks the taps, retry with adjusted coordinates.
- **Execution Confirmation**: After gesture injection, monitors the Accessibility event stream for confirmation that the PIN was accepted (screen transition) or rejected (error dialog).

## Capabilities

### New Capabilities

- `gesture-sequence-builder`: Converts float coordinate arrays to `GestureDescription.StrokeDescription` sequences with configurable timing
- `pin-grid-analyzer`: Accessibility tree walking to extract Smart-ID app PIN grid layout, button positions, and dimensions
- `blind-actuation-engine`: `dispatchGesture()` invocation with execution monitoring, retry logic, and error recovery
- `flag-secure-bypass-detection`: Detection of gesture injection success/failure on FLAG_SECURE windows, verifying the target app package and checking screen state before injection (covered by `blind-actuation-engine` target verification and `execution-confirmation` screen state checks)

### Modified Capabilities

- Existing `a11y-bridge` accessibility service: adds ghost actuation alongside (or replacing) the existing semantic node interaction mode
- `react-native-companion-app`: The actuation module is exposed to React Native JS via `GhostActuatorBridgeModule.kt` — a thin RN Native Module wrapping `GhostActuatorService.kt`; JS calls `holdSequence()`/`executeSequence()` via the bridge, the bridge sends intents to the service

## Impact

- **Android Vault app**: `GhostActuatorService.kt` — existing AccessibilityService binding (unchanged). `GhostActuatorBridgeModule.kt` — NEW RN Native Module wrapping the service for JS access. `GestureBuilder.kt` — stroke description construction. `PinGridAnalyzer.kt` — layout extraction.
- **AndroidManifest.xml**: New `<service>` declaration for `GhostActuatorService` with `BIND_ACCESSIBILITY_SERVICE` permission. Must be separately enabled by the user in Settings.
- **Smart-ID app specific logic**: The PIN grid analyzer must handle Smart-ID app version differences. Grid position may shift between app versions; the analyzer should use resource IDs and content descriptions as anchors.
- **Fallback**: If `dispatchGesture()` fails or the Smart-ID app changes its UI layout, fall back to the WebRTC-based manual phone interaction (user picks up the phone and enters PIN manually).
- **Testing**: Requires a real Android device with Smart-ID app installed. Test against Smart-ID demo/test environment. Automated testing via ADB-controlled emulator with Smart-ID sandbox.

## V6 Alignment

PHASE 1 + PHASE 2A (DUAL-PHASE) — The GhostActuator Kotlin service is the same code in both phases, but its coordinate source changes:
- **Phase 1**: Coordinates come from the React Native CommandServer (PIN decrypted in JS, passed via RN Native Module bridge). This is the MVP path — the PIN enters JS memory, but the GhostActuator's `dispatchGesture()` ensures the taps reach FLAG_SECURE windows.
- **Phase 2A**: Coordinates come from the NDK enclave (PIN decrypted in `mlock`'d C++ memory, never enters JVM or JS heap). This achieves the "Architecturally Eliminated" status for memory dump threats.

The service itself (`GhostActuatorService.kt`, `GhostActuatorBridge`, `GestureOptions`, `execution confirmation`, `error recovery`) is identical. Only the origin of the coordinate array changes between phases.

## Dependencies

**Phase 1 dependencies (coordinate source = React Native JS bridge):**
- Builds on: `react-native-companion-app` (provides the RN Native Module bridge that JS uses to call `holdSequence()`/`executeSequence()` on the GhostActuatorService)
- Not blocked — coordinate inputs come from JS (RN CommandServer decrypts PIN and passes coordinates). The `GhostActuatorService.kt` is fully functional without the NDK enclave.

**Phase 2A dependencies (coordinate source = NDK enclave):**
- Blocked on: `ndk-enclave-pin-vault` (provides coordinates directly from mlocked C++ memory, bypassing JS heap entirely)
- Blocked on: `native-host-quality-gate` (delivers the verified payload that authorizes actuation over AOA 2.0 or WebRTC fallback)
- Related: `eidas-qes-hardware-gate` (extends Ghost Actuator with hardware interrupt suspension)

**The GhostActuator Kotlin code is identical in both phases** — it receives `float[] coordinates` either way. Only the origin of the coordinates changes: JS decrypted PIN in Phase 1, C++ enclave in Phase 2A.
