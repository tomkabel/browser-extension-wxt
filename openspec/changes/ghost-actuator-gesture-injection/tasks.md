## 7. Extension/Attestation Integration

- [x] 7.6 Run `bun run lint && bun run typecheck` on extension side

## 1. PIN Grid Layout Analyzer

- [ ] 1.1 Implement `PinGridAnalyzer.kt`: walk Accessibility tree of foreground Smart-ID app to find PIN grid container
- [ ] 1.2 Implement `findGridContainer()`: locate by resource ID (e.g., `com.smartid:id/keypad_*`) fall back to position-based heuristics
- [ ] 1.3 Extract digit button bounds: iterate children of grid container, sort by `(top * 10000 + left)`, compute exactCenterX/Y
- [ ] 1.4 Return `GridInfo`: center positions (index 0-9 → digits 1-9,0), grid bounds rect, app version code
- [ ] 1.5 Handle layout variation: Smart-ID app version-specific heuristics, ship known grid layouts in resources
- [ ] 1.6 Handle analyzer failure: return `null`, fall back to hardcoded grid based on app version + screen resolution
- [ ] 1.7 Unit test: analyzer parses known grid layout correctly
- [ ] 1.8 Unit test: analyzer returns `null` for non-Smart-ID app

## 2. Execution Confirmation

- [ ] 2.1 Implement `onAccessibilityEvent()` monitoring: detect `TYPE_WINDOW_STATE_CHANGED` for Smart-ID processing screen (success) and `TYPE_WINDOW_CONTENT_CHANGED` for error dialog (failure)
- [ ] 2.2 On success: notify Java Orchestrator, log audit event
- [ ] 2.3 On PIN rejection: notify Orchestrator with `PinError.INCORRECT_PIN`, let Orchestrator decide retry or abort
- [ ] 2.4 On abort: require manual user intervention via phone (fall back to manual PIN entry)

## 3. Error Recovery

- [ ] 3.1 Implement retry logic: if `dispatchGesture()` returns cancelled, retry with `retryDelayMs` (default 500ms) up to `maxRetries` (default 2)
- [ ] 3.2 Implement coordinate adjustment: on gesture injection failure, adjust coordinates by ±5px for retry
- [ ] 3.3 Implement `isScreenOn()` check: verify no system overlay (notification panel, battery saver) is active before injection
- [ ] 3.4 Fallback to WebRTC manual phone interaction if `dispatchGesture()` fails persistently

## 4. GestureOptions Configuration

- [ ] 4.1 Implement `GestureOptions` data class: `tapDurationMs`, `interTapDelayMs`, `retryDelayMs`, `maxRetries`
- [ ] 4.2 Make options configurable via the Android Vault settings (developer mode)
- [ ] 4.3 Implement adaptive timing: adjust `interTapDelayMs` based on device performance metrics

## 5. User Setup Flow

- [ ] 5.1 Guide user through AccessibilityService enablement during Phase 0 setup: Settings → Accessibility → SmartID Vault → Enable
- [ ] 5.2 Detect if AccessibilityService is enabled; show persistent notification if not
- [ ] 5.3 Handle service disablement mid-session: fall back to manual phone interaction

## 6. Integration & Testing

- [ ] 6.1 Integration test: GhostActuatorService receives coordinates, constructs gestures, calls dispatchGesture, returns result
- [ ] 6.2 Integration test: PIN grid analyzer extracts correct coordinates from Smart-ID app's grid layout
- [ ] 6.3 Integration test: retry logic fires on first failure, succeeds on retry
- [ ] 6.4 Integration test: WebRTC fallback triggered when AccessibilityService not enabled
- [ ] 6.5 Manual QA: test on real Android device with Smart-ID app installed (demo/test environment)
