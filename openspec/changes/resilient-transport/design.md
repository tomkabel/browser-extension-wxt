## Context

The current architecture assumes both devices are on the same local network (mDNS). This fails in:
- Corporate Wi-Fi with Layer 2 AP Isolation (devices can't see each other)
- Aggressive firewalls that block UDP
- Cellular hotspots (different NATs)
- Coffee shop/public Wi-Fi with client isolation

ARCHITECTURE.md Phase 2 requires an ICE candidate waterfall: mDNS (local) → TURN/UDP (relayed) → TURN/TCP 443 (firewall-traversing). The goal is 99.99% connection success with zero user-visible errors.

## Goals / Non-Goals

**Goals:**
- Deploy a TURN server on port 443 (TCP) to traverse all firewalls
- Configure WebRTC to try local first, then relay, without user intervention
- Provide connection quality metrics (dev mode only)
- Automatic retry with exponential backoff on transient failures

**Non-Goals:**
- Self-hosted TURN on user's own infrastructure
- TURN over TLS/TCP 443 with a valid certificate (use self-signed; DTLS inside provides security)
- Bandwidth limiting or QoS management (TURN relay uses minimal bandwidth for credential-sized messages)

## Decisions

### Decision 1: TURN server — coturn on Fly.io

Use coturn (industry-standard open-source TURN/STUN server) deployed on Fly.io. Fly.io supports UDP and TCP on the same app, which is critical for the TCP 443 fallback.

**Why coturn**: Battle-tested, supports both UDP and TCP, ephemeral credentials via REST API, lightweight (~20MB memory).
**Why Fly.io**: Supports UDP on custom ports, free tier covers dev needs, Dockerfile-friendly.

### Decision 2: Ephemeral TURN credentials via signaling server

The signaling server serves an authenticated `/turn-credentials` endpoint that returns a time-limited (5-minute) username/password for the TURN server. The offscreen WebRTC document fetches credentials just before creating the `RTCPeerConnection`.

**Why**: Static credentials are a security risk. Ephemeral HMAC-based credentials (coturn's `--use-auth-secret` mode) expire after 5 minutes and are single-use.

### Decision 3: ICE waterfall ordering — local-first, then relay

The `RTCPeerConnection` is configured with:
1. `iceTransportPolicy: 'all'` (not 'relay' — try local first)
2. ICE candidate gathering is NOT gated by policy; instead, we use a 3-second timer:
   - If a local (host/srflx) candidate pair succeeds within 3s → use it
   - Otherwise, switch mode to prefer relay candidates
   - Auto-fallback to TCP if UDP relay fails to establish within 5s

**Why**: Chrome's built-in ICE prioritization already prefers local candidates. The timer-based approach avoids the pathological case where ICE gets stuck trying a local candidate that will never work (AP isolation).

## Risks / Trade-offs

- [Risk] TURN server becomes a single point of failure → Mitigation: deploy a secondary TURN instance on a different region; add it as a backup ICE server
- [Risk] TCP 443 TURN traffic could be rate-limited by corporate proxies (looks like long-lived HTTPS) → Mitigation: implement WebSocket reconnection with jittered backoff
- [Risk] TURN bandwidth costs at scale → Mitigation: each credential payload is <1KB; 1000 users/day = ~30MB/month of relay traffic (negligible)
