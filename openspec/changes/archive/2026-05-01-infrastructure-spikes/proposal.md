## Why

The entire SmartID2 architecture depends on three unproven technical decisions: WebAuthn within a chrome-extension:// origin, WebRTC offscreen document lifecycle, and a11y-bridge API reliability. Building production code before these are verified creates unacceptable risk of complete architectural failure.

## What Changes

No production code changes. Three independent proof-of-concept spikes:

- **Spike 0.1: WebAuthn feasibility** — Verify `navigator.credentials.create/get` works from a `chrome-extension://` auth page tab with a stable extension ID. Test both direct invocation and content script interception approaches.
- **Spike 0.2: WebRTC offscreen document lifecycle** — Verify `RTCPeerConnection` survives service worker termination. Test `offscreenReason: 'WEB_RTC'`. Validate keepalive strategies including port-based SW persistence and popup-connection fallback.
- **Spike 0.3: a11y-bridge API verification** — Install a11y-bridge APK, test `/screen`, `/ping`, `/click` endpoints, measure latency, document edge cases.

## Capabilities

### New Capabilities

- `webauthn-feasibility`: Verify that WebAuthn API can be invoked from a chrome-extension:// origin context with platform authenticator
- `webrtc-offscreen-lifecycle`: Validate that RTCPeerConnection and data channels survive Chrome MV3 service worker termination
- `a11y-bridge-api`: Confirm a11y-bridge HTTP API works reliably with sub-100ms response times for /screen

### Modified Capabilities

None — these are entirely new capabilities.

## Impact

- `entrypoints/auth/` — Created during Spike 0.1 test
- `openspec/specs/webauthn-feasibility/` — New spec for spike findings
- `openspec/specs/webrtc-offscreen-lifecycle/` — New spec for spike findings
- `openspec/specs/a11y-bridge-api/` — New spec for spike findings
- No production code is committed. All spikes are throwaway proofs-of-concept.
