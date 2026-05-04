## 1. TURN Server Deployment

- [x] 1.1 Create `turn-server/` directory with Dockerfile for coturn
- [x] 1.2 Configure coturn with UDP 3478 + TCP 443 listeners, ephemeral HMAC auth, and Fly.io-compatible settings
- [x] 1.3 Update `fly.toml` to expose UDP 3478 and TCP 443 ports for TURN
- [x] 1.4 Deploy TURN server to Fly.io, verify STUN binding and TURN allocation work
- [x] 1.5 Set `TURN_SECRET` environment variable in Fly.io secrets for HMAC authentication

## 2. Signaling Server Updates

- [x] 2.1 Add `GET /turn-credentials` endpoint to `signaling-server/server.js` returning `{ username, password, ttl, urls }`
- [x] 2.2 Generate ephemeral TURN credentials using HMAC-SHA1 with timestamp + expiry
- [x] 2.3 Add emoji SAS support to signaling server (`join-room` accepts both `/^\d{6}$/` and `/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]{3}$/u`)
- [x] 2.4 Add `VITE_TURN_URL` and `VITE_TURN_SECRET` to `.env` with validation
- [x] 2.5 Redeploy signaling server to Fly.io with updated code

## 3. ICE Waterfall Implementation

- [x] 3.1 Update `entrypoints/offscreen-webrtc/main.ts` to fetch TURN credentials from signaling server before `RTCPeerConnection` creation
- [x] 3.2 Configure `RTCPeerConnection` with ICE server list: `[{ urls: 'stun:...' }, { urls: ['turn:...', 'turns:...'], credential, username }]`
- [x] 3.3 Implement 3-second timer: if no local candidate pair connects, do nothing (ICE handles fallback automatically with relay candidates)
- [x] 3.4 Add `iceTransportPolicy` fallback logic: start with `'all'`, provide relay-only retry on failure
- [x] 3.5 Add connection state monitoring: log `selectedCandidatePair` type and RTT in dev mode

## 4. Connection Resilience

- [x] 4.1 Add connection state machine in `offscreenWebrtc.ts`: `disconnected | connecting | connected | reconnecting`
- [x] 4.2 Implement automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [x] 4.3 On reconnect: fetch new TURN credentials, create new `RTCPeerConnection`, re-run IK handshake
- [x] 4.4 Add `connectionState` to Zustand store and display in popup (silent — no error popup, just status text)
- [x] 4.5 Add "Unable to connect" fallback message with "Retry" button (shown only after 15s of total failure)

## 5. Configuration & CSP

- [x] 5.1 Add TURN server URL to `wxt.config.ts` CSP `connect-src`
- [x] 5.2 Add `VITE_TURN_URL` validation to `prebuild` script
- [x] 5.3 Update documentation in `README.md` with TURN server setup instructions

## 6. Spec Alignment (see analysis in ARCHITECTURE.md review)

- [x] 6.1 Create `turn-server/` deployment artifacts (Dockerfile, coturn.conf, fly.toml)
- [x] 6.2 Update `signaling-server/server.js` — add `GET /turn-credentials` endpoint, emoji SAS room support
- [x] 6.3 Create `openspec/specs/integration-flow/spec.md` — full lifecycle scenarios across all 4 phases
- [x] 6.4 Create `openspec/specs/signaling-server-interface/spec.md` — wire protocol contract

## 7. Testing

- [x] 7.1 Unit test: ICE server configuration fetched and parsed correctly
- [x] 7.2 Unit test: connection state machine transitions
- [ ] 7.3 Manual QA: test connection on home Wi-Fi (local, <5ms)
- [ ] 7.4 Manual QA: test connection behind UDP-blocking firewall (TURN/TCP 443)

> **Note**: Deployed endpoints:
> - Signaling: `https://smartid2-signaling.fly.dev`
> - TURN: `turn:smartid2-turn.fly.dev:3478` (UDP), also reachable via TCP 443
> - Set `VITE_SIGNALING_URL=https://smartid2-signaling.fly.dev` and `VITE_TURN_URL=turn:smartid2-turn.fly.dev:3478?transport=udp` for production use
- [x] 7.5 Run `bun run lint && bun run typecheck` and fix all issues
