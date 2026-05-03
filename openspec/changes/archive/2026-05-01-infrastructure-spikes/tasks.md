## 1. Set Up Test Extension with Fixed ID

- [x] 1.1 Generate an RSA key and extract the public key for `manifest.key` in `wxt.config.ts`
- [x] 1.2 Create `entrypoints/auth/` directory with `index.html` minimal page
- [x] 1.3 Add `web_accessible_resources` configuration for the auth page
- [x] 1.4 Build and install the extension with a stable extension ID

## 2. Spike 0.1: WebAuthn Feasibility

- [x] 2.1 Create auth page that calls `navigator.credentials.create()` on load (direct invocation from `<script>` tag)
- [x] 2.2 Test credential creation with `rp: { id: chrome.runtime.id }` and `authenticatorAttachment: 'platform'`, `userVerification: 'required'`
- [x] 2.3 Verify credential persists across extension reload
- [x] 2.4 Create auth page that calls `navigator.credentials.get()` on load with `userVerification: 'required'`
- [x] 2.5 Verify the tab survives the platform authenticator OS dialog focus loss
- [x] 2.6 Also test content script interception approach (override `navigator.credentials.create/get` in content script with `world: 'MAIN'`)
- [x] 2.7 Verify no approach works: test direct `<script>` tag invocation (not content script override)
- [x] 2.8 Document all findings in `research/webauthn-extension-spike-results.md`

## 3. Spike 0.2: WebRTC Offscreen Document Lifecycle

- [x] 3.1 Create offscreen document with `offscreenReason: 'WEB_RTC'` containing RTCPeerConnection
- [x] 3.2 Set up minimal Socket.io signaling server locally
- [x] 3.3 Verify RTCPeerConnection and data channel work in offscreen document
- [x] 3.4 Test keepalive strategy: popup establishes `runtime.connect({ name: 'webrtc-keepalive' })` port
- [x] 3.5 Close popup, wait 60s, send new message — verify offscreen document is still alive or recreated
- [x] 3.6 Test popup-connection fallback: RTCPeerConnection directly in popup
- [x] 3.7 Document findings in `research/webrtc-offscreen-lifecycle-spike-results.md`

## 4. Spike 0.3: a11y-bridge API Verification

- [x] 4.1 Download and install a11y-bridge APK on test phone
- [x] 4.2 Enable Accessibility Service in Settings
- [x] 4.3 Forward ADB port: `adb forward tcp:7333 tcp:7333`
- [x] 4.4 Test `curl http://localhost:7333/ping`
- [x] 4.5 Test `curl http://localhost:7333/screen` and verify response format
- [x] 4.6 Test `curl http://localhost:7333/screen?compact` and measure latency
- [x] 4.7 Test `curl -X POST http://localhost:7333/click -d '{"text":"Settings"}'`
- [x] 4.8 Document all edge cases and response formats in `research/a11y-bridge-api-spike-results.md`
