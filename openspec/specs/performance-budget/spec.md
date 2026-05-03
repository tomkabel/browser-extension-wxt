# performance-budget Specification

## Purpose

Define measurable performance budgets for every latency-sensitive and resource-constrained component in the SmartID2 extension, transport layer, and V6 architecture. These budgets guide implementation decisions, inform CI thresholds, and prevent regressions as new capabilities are added.

## Budgets

### Service Worker Lifecycle
- **Budget**: Max 30 seconds active before idle termination
- **Rationale**: Chrome MV3 enforces service worker termination; all critical work (session activation, pairing handshake, transport negotiation) MUST complete within this window
- **Measurement**: `performance.now()` delta from `chrome.runtime.onStartup` or `chrome.runtime.onMessage` entry to completion of async handler chain
- **Enforcement**: CI E2E tests must complete pairing and transaction detection within 30s in headless Chromium

### Offscreen Document Memory
- **Budget**: Max 50 MB
- **Rationale**: Offscreen documents are not visible to the user and should not compete with foreground tabs for RAM; WebRTC peer connection + signaling state is the primary consumer
- **Measurement**: `performance.memory.usedJSHeapSize` (Chromium DevTools Protocol) sampled every 5 seconds during active WebRTC session
- **Enforcement**: Memory profiling step in CI build; fail if heap exceeds 50 MB during a 60-second test session

### Popup Render Time
- **Budget**: < 100 ms from click to first paint
- **Rationale**: Popup must feel instant; users will abandon if the panel appears blank or stalls
- **Measurement**: `PerformanceObserver` entry for `first-paint` from `popup.html` load start (captured in E2E via Playwright `page.evaluate`)
- **Enforcement**: Playwright E2E assertion on popup open action; median of 5 runs must be < 100 ms

### WebRTC Signaling Latency
- **Budget**: < 500 ms to establish data channel
- **Rationale**: Includes offer creation, signaling server round-trip, TURN credential fetch, ICE gathering, and answer exchange
- **Measurement**: Delta from `RTCPeerConnection` creation to `datachannel.onopen`
- **Enforcement**: E2E transport test; CI runs on every PR affecting `lib/transport/` or `entrypoints/offscreen-webrtc/`

### USB AOA Transport Latency
- **Budget**: < 50 ms per round-trip
- **Rationale**: AOA 2.0 bulk transfer + Go native host processing + extension `chrome.runtime.sendNativeMessage` overhead
- **Measurement**: Ping-pong message (`{ type: 'ping' }` → `{ type: 'pong' }`) averaged over 100 iterations
- **Enforcement**: Go benchmark test in `usb-aoa-transport-proxy` CI; median latency must be < 50 ms

### zkTLS Attestation Latency
- **Budget**: < 20 ms total
- **Rationale**: WASM prover must generate a TLSNotary-style attestation without blocking the extension UI thread
- **Measurement**: `performance.now()` delta from invocation of `zktls.prove()` to resolution of returned `Promise`
- **Enforcement**: Vitest benchmark in `zktls-context-engine`; CI fail if mean > 20 ms on GitHub Actions runner

### NDK Enclave PIN Processing
- **Budget**: < 100 ms
- **Rationale**: PIN → coordinate mapping happens inside the NDK enclave (`mlock`-ed memory); user perceives this as part of the Smart-ID app unlock flow
- **Measurement**: Android `SystemClock.elapsedRealtime()` delta from JNI entry to coordinate array return
- **Enforcement**: Android instrumented test; 99th percentile over 1000 iterations must be < 100 ms

### Ghost Actuator Gesture Dispatch
- **Budget**: < 500 ms per tap
- **Rationale**: `dispatchGesture` injects a tap onto the Smart-ID PIN grid; total time includes enclave coordinate output + accessibility service dispatch + UI response
- **Measurement**: `SystemClock.elapsedRealtime()` from gesture intent creation to `AccessibilityEvent.TYPE_VIEW_CLICKED` confirmation
- **Enforcement**: Android UI Automator integration test; single-tap latency must be < 500 ms

### eIDAS QES Gate Timeout
- **Budget**: 10 s user response window
- **Rationale**: Volume Down hardware interrupt must be captured within a strict window to satisfy eIDAS QES legal requirements; user needs time to physically press the button
- **Measurement**: Delta from QES gate overlay display to `VolumeDown` key event or timeout cancellation
- **Enforcement**: Manual QA checklist for every QES gate release; automated test mocks `KeyEvent.KEYCODE_VOLUME_DOWN`

### Extension Bundle Size
- **Budget**: < 2 MB total (excluding Android APK)
- **Rationale**: Chrome Web Store review favors small packages; MV3 service worker + offscreen document + popup assets + content scripts must fit under store limits
- **Measurement**: `du -sh .output/chrome-mv3/` after `bun run build`
- **Enforcement**: Build script rejects bundles ≥ 2 MB; CI artifact size check on every PR

### Go Native Host Binary Size
- **Budget**: < 5 MB per platform (Windows, macOS, Linux)
- **Rationale**: Users download and install the native host separately; large binaries increase friction and trigger antivirus false positives
- **Measurement**: `ls -la` of compiled `smartid-host.exe`, `smartid-host`, `smartid-host-darwin` after `go build -ldflags="-s -w"`
- **Enforcement**: Go build CI step fails if any platform binary exceeds 5 MB
