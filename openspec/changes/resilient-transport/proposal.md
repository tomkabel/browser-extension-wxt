## Why

The current WebRTC transport has three single points of failure:

1. **Cloud signaling server SPOF**: The entire pairing flow depends on Socket.IO cloud signaling (Fly.io). No offline pairing, network outages break pairing, censorship surface (WebSocket to *.fly.dev).
2. **TURN credentials HTTP dependency**: Every connection requires `GET /turn-credentials` which means a round-trip to the signaling server. If the signaling server is down, TURN is unavailable (even if the coturn server itself is healthy).
3. **USB transport 2-second polling**: `TransportManager` polls USB availability every 2 seconds, waking the service worker and consuming CPU for `chrome.runtime.connectNative` IPC.

Resilient transport addresses all three with minimal infrastructure changes.

## What Changes

- **QR-embedded SDP offer**: Instead of a server-mediated SDP exchange, encode the initiator's entire SDP offer directly into the QR code. The phone scans the QR, gets the complete SDP offer + ICE candidates, creates an answer locally, and establishes WebRTC without any server round-trip. This is "WebRTC Perfect Negotiation" — supported by the spec but requires polite/impolite role negotiation.
- **Static TURN config fallback**: Embed a long-lived TURN credential directly in the extension build (rotated monthly via Chrome Web Store auto-update). The offscreen document uses this as fallback if the signaling server's `/turn-credentials` endpoint is unreachable.
- **Event-driven USB detection**: Replace 2-second polling with `chrome.runtime.onConnectNative` push notifications from the Go native host. The Go host already has hotplug monitoring — it sends a native message when USB device connects/disconnects. For non-USB transports, use `chrome.idle.onStateChanged` — if the user is active, the phone is likely within range.
- **Cloud TURN server** (existing): coturn on Fly.io with UDP 3478 and TCP 443, ephemeral HMAC-based credentials.
- **ICE candidate waterfall** (existing): mDNS → TURN/UDP → TURN/TCP 443 with configurable timeouts.

## Capabilities

### New Capabilities

- `qr-embedded-sdp`: WebRTC Perfect Negotiation — initiator SDP embedded in QR, server-less pairing
- `static-turn-fallback`: Long-lived TURN credential embedded in extension build for offline resilience
- `event-driven-usb`: Replace polling with push notifications from Go native host hotplug events
- `connection-resilience` (existing): State machine with reconnect and quality metrics

### Modified Capabilities

- `webrtc-signaling`: Signaling server becomes optional (still needed for late-joining peers, TURN credential refresh, post-pairing fallback)
- `turn-server-deployment`: Static credential rotation added as fallback strategy
- `transport-manager`: Polling replaced with event-driven USB detection

## Impact

- **Browser extension**: `lib/transport/TransportManager.ts` — remove polling timers, add native host push listener. `lib/channel/qrCode.ts` — add SDP compression/encoding. `entrypoints/offscreen-webrtc/main.ts` — add static TURN fallback.
- **Offscreen document**: Handle both signaling-server and QR-embedded SDP flows. Fallback to signaling server if QR SDP fails.
- **Signaling server**: No changes required. Still used for TURN credential issuance and post-pairing fallback.
- **Android phone**: Must support QR-embedded SDP extraction (parse QR payload, create WebRTC answer, initiate ICE).
- **Bundle size**: QR SDP compression (pako/deflate) adds ~5KB. Static TURN config is <100 bytes.

## Dependencies

- QR-embedded SDP: Requires Android app to parse QR payload for SDP field. Backward compatible — older app ignores `sdp` field and uses signaling server as before.
- Static TURN: Requires monthly rotation strategy (Chrome Web Store auto-update triggers extension update with new credential).
- Event-driven USB: Requires Go native host to send `device-attached` / `device-removed` messages. The host already has hotplug monitoring — only the message dispatch to `chrome.runtime.onConnectNative` is missing.
