## Context

The full SmartID2 architecture (WebRTC data channels, Noise XX handshake, QR/SAS pairing, WebAuthn MFA, transaction commands) is designed but rests on three unproven foundations. Each spike independently validates one foundation. If any spike fails, the architecture must be redesigned before proceeding.

## Goals / Non-Goals

**Goals:**
- Validate WebAuthn API access from chrome-extension:// origin with platform authenticator
- Validate WebRTC offscreen document survives service worker termination
- Validate a11y-bridge HTTP API latency and reliability

**Non-Goals:**
- Building production code or UI
- Implementing Noise or command protocols
- Designing pairing flow
- Writing test suites

## Decisions

### Spike 0.1: WebAuthn Feasibility

**Decision**: Create a minimal extension auth page and test BOTH:
1. Direct `navigator.credentials.create/get` from the page's own `<script>` tag (no interception)
2. Content script interception with `world: 'MAIN'` and `match_origin_as_fallback`

**Approach**: 
- Set up a fixed extension ID via `manifest.key` in `wxt.config.ts`
- Create `entrypoints/auth/index.html` as an extension page
- Register a credential with `rp: { id: chrome.runtime.id }`
- Assert with `userVerification: 'required'` to force platform authenticator dialog
- Document whether the tab survives the OS dialog focus loss

**Pass criteria**: `navigator.credentials.create` succeeds, credential persists across extension reloads, `get` works with biometric prompt.

### Spike 0.2: WebRTC Offscreen Document Lifecycle

**Decision**: Test three approaches for RTCPeerConnection lifecycle:

1. **Offscreen document**: Create offscreen doc with `offscreenReason: 'WEB_RTC'`, establish RTCPeerConnection, close all popup ports, wait 60s for SW to terminate, verify data channel still alive
2. **Popup-connection**: Create RTCPeerConnection directly in popup (popup must remain open). Close and re-open popup; verify new connection is established
3. **SW port keepalive**: Open a long-lived `runtime.connect` port from popup to keep SW alive; verify offscreen document persists

**Best approach** wins based on reliability (not convenience). Pass criteria: data channel messages exchange successfully after SW restart.

### Spike 0.3: a11y-bridge API Verification

**Decision**: Install a11y-bridge APK, forward ADB port, test HTTP API.

**Approach**:
- `adb forward tcp:7333 tcp:7333`
- `curl http://localhost:7333/ping` — verify 200 + JSON
- `curl http://localhost:7333/screen` — verify response format
- `curl -X POST http://localhost:7333/screen?compact` — measure response time
- `curl -X POST http://localhost:7333/click -d '{"text":"Settings"}'` — verify click works
- Document all edge cases: app not on screen, empty screen, no root window, service not enabled
