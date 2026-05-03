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
- `fl Secure-bypass-monitor`: Detection of gesture injection success/failure on FLAG_SECURE windows

### Modified Capabilities

- Existing `a11y-bridge` accessibility service: adds ghost actuation alongside (or replacing) the existing semantic node interaction mode
- `android-companion-app`: The actuation module switches from ADB-based `input tap` to native `dispatchGesture` for Smart-ID interaction

## Impact

- **Android Vault app**: `GhostActuatorService.kt` — new AccessibilityService binding. `GestureBuilder.kt` — stroke description construction. `PinGridAnalyzer.kt` — layout extraction.
- **AndroidManifest.xml**: New `<service>` declaration for `GhostActuatorService` with `BIND_ACCESSIBILITY_SERVICE` permission. Must be separately enabled by the user in Settings.
- **Smart-ID app specific logic**: The PIN grid analyzer must handle Smart-ID app version differences. Grid position may shift between app versions; the analyzer should use resource IDs and content descriptions as anchors.
- **Fallback**: If `dispatchGesture()` fails or the Smart-ID app changes its UI layout, fall back to the WebRTC-based manual phone interaction (user picks up the phone and enters PIN manually).
- **Testing**: Requires a real Android device with Smart-ID app installed. Test against Smart-ID demo/test environment. Automated testing via ADB-controlled emulator with Smart-ID sandbox.

## V6 Alignment

PHASE 2 — Core V6 capability. This is the Layer 4 execution mechanism that transforms mathematically verified intent (zkTLS + WebAuthn) into physical action on the Smart-ID app, without ever handling plaintext secrets. Completes the "Architecturally Eliminated" chain for memory dump and IPC interception threats.

## Dependencies

- Blocked on: `ndk-enclave-pin-vault` (provides the coordinate inputs)
- Builds on: `usb-aoa-transport-proxy` (completed — delivers the verified payload that authorizes actuation over AOA 2.0 or WebRTC fallback)
- Related: `eidas-qes-hardware-gate` (extends Ghost Actuator with hardware interrupt suspension)
