## Why

The current WebRTC transport only works when both devices are on the same local network (via mDNS). Corporate Wi-Fi with Layer 2 AP Isolation, aggressive UDP-blocking firewalls, and 5G hotspots all cause connection failures. ARCHITECTURE.md Phase 2 requires an "ICE Candidate Waterfall" (mDNS → TURN/UDP → TURN/TCP 443) that succeeds 99.99% of the time with no user-visible errors. Without this, the extension is unusable outside home Wi-Fi.

## What Changes

- **Deploy a cloud TURN server** (coturn or pion/turn) with UDP 3478 and TCP 443 listeners
- **Configure ICE server list** in the WebRTC offscreen document to try mDNS first, then TURN relay
- **Implement ICE candidate waterfall logic** with silent fallback progression
- **Add TURN authentication** using ephemeral credentials issued by the signaling server
- **Add connection quality monitoring** and metrics (latency, relay usage) in dev mode
- **Graceful degradation UX**: The popup never shows a connection error; instead shows "Connecting..." with automatic retry

## Capabilities

### New Capabilities

- `turn-server-deployment`: Deploy and configure a production TURN server (UDP + TCP 443) with ephemeral credential API
- `ice-candidate-waterfall`: WebRTC ICE configuration that tries mDNS → TURN/UDP → TURN/TCP 443 in sequence without user intervention
- `connection-resilience`: Connection state machine with automatic retry, transport quality metrics, and silent fallback

### Modified Capabilities

- `webrtc-signaling`: Signaling server gains a `/turn-credentials` endpoint that issues time-limited TURN credentials; ICE server configuration becomes dynamic

## Impact

- `signaling-server/server.js` — New `/turn-credentials` endpoint for ephemeral TURN auth
- `entrypoints/offscreen-webrtc/main.ts` — Dynamic ICE server configuration, candidate waterfall logic, connection quality events
- `entrypoints/background/offscreenWebrtc.ts` — Connection state monitoring, keep-alive with TURN relay awareness
- `wxt.config.ts` — TURN server URL in CSP `connect-src`
- Infrastructure: Deploy coturn or pion/turn on Fly.io/Render with UDP + TCP 443
- Fly.io config (`fly.toml`) — Update ports for TURN server
- `.env` — Add `VITE_TURN_URL` and `VITE_TURN_SECRET` environment variables
