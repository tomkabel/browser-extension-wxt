## 1. GhostActuatorService — AccessibilityService

- [ ] 1.1 Implement `GhostActuatorService.kt`: extends `AccessibilityService` with `BIND_ACCESSIBILITY_SERVICE` manifest declaration
- [ ] 1.2 Implement `executeGestureSequence()`: accepts `FloatArray` coordinates + `GestureOptions`, constructs `GestureDescription.StrokeDescription` for each coordinate pair
- [ ] 1.3 Implement `GestureResultCallback`: `onCompleted` completes the `CompletableFuture` successfully, `onCancelled` triggers retry according to configured retry policy (see section 4 — retry up to `maxRetries` times after the initial attempt)
- [ ] 1.4 Implement sequential tap timing: each tap has configurable duration (default 50ms) and inter-tap delay (default 100ms)
- [ ] 1.5 Implement target verification: verify `rootInActiveWindow.packageName == "ee.sk.smartid"` before executing any gesture
- [ ] 1.6 Unit test: single-tap gesture construction produces correct StrokeDescription
- [ ] 1.7 Unit test: multi-tap gesture sequence with correct timing offsets

## 2. PIN Grid Layout Analyzer

- [ ] 2.1 Implement `PinGridAnalyzer.kt`: walk Accessibility tree of foreground Smart-ID app to find PIN grid container
- [ ] 2.2 Implements `findGridContainer()`: locate by resource ID (e.g., `com.smartid:id/keypad_*`) fall back to position-based heuristics
- [ ] 2.3 Extract digit button bounds: iterate children of grid container, sort by `(top * 10000 + left)`, compute exactCenterX/Y
- [ ] 2.4 Return `GridInfo`: center positions (index 0-9 → digits 1-9,0), grid bounds rect, app version code
- [ ] 2.5 Handle layout variation: Smart-ID app version-specific heuristics, ship known grid layouts in resources
- [ ] 2.6 Handle analyzer failure: return `null`, fall back to hardcoded grid based on app version + screen resolution
- [ ] 2.7 Unit test: analyzer parses known grid layout correctly
- [ ] 2.8 Unit test: analyzer returns `null` for non-Smart-ID app

## 3. Execution Confirmation

- [ ] 3.1 Implement `onAccessibilityEvent()` monitoring: detect `TYPE_WINDOW_STATE_CHANGED` for Smart-ID processing screen (success) and `TYPE_WINDOW_CONTENT_CHANGED` for error dialog (failure)
- [ ] 3.2 On success: notify Java Orchestrator, log audit event
- [ ] 3.3 On PIN rejection: notify Orchestrator with `PinError.INCORRECT_PIN`, let Orchestrator decide retry or abort
- [ ] 3.4 On abort: require manual user intervention via phone (fall back to manual PIN entry)

## 4. Error Recovery

- [ ] 4.1 Implement retry logic: if `dispatchGesture()` returns cancelled, retry with `retryDelayMs` (default 500ms) up to `maxRetries` (default 2)
- [ ] 4.2 Implement coordinate adjustment: on gesture injection failure, adjust coordinates by ±5px for retry
- [ ] 4.3 Implement `isScreenOn()` check: verify no system overlay (notification panel, battery saver) is active before injection
- [ ] 4.4 Fallback to WebRTC manual phone interaction if `dispatchGesture()` fails persistently

## 5. GestureOptions Configuration

- [ ] 5.1 Implement `GestureOptions` data class: `tapDurationMs`, `interTapDelayMs`, `retryDelayMs`, `maxRetries`
- [ ] 5.2 Make options configurable via the Android Vault settings (developer mode)
- [ ] 5.3 Implement adaptive timing: adjust `interTapDelayMs` based on device performance metrics

## 6. User Setup Flow

- [ ] 6.1 Guide user through AccessibilityService enablement during Phase 0 setup: Settings → Accessibility → SmartID Vault → Enable
- [ ] 6.2 Detect if AccessibilityService is enabled; show persistent notification if not
- [ ] 6.3 Handle service disablement mid-session: fall back to manual phone interaction

## 7. Integration & Testing

- [ ] 7.1 Integration test: GhostActuatorService receives coordinates, constructs gestures, calls dispatchGesture, returns result
- [ ] 7.2 Integration test: PIN grid analyzer extracts correct coordinates from Smart-ID app's grid layout
- [ ] 7.3 Integration test: retry logic fires on first failure, succeeds on retry
- [ ] 7.4 Integration test: WebRTC fallback triggered when AccessibilityService not enabled
- [ ] 7.5 Manual QA: test on real Android device with Smart-ID app installed (demo/test environment)
- [ ] 7.6 Run `bun run lint && bun run typecheck` on extension side
