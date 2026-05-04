## Why

The WebRTC data channel's CommandClient uses a basic ACK/retry strategy (3 max attempts) with no RTT estimation, no adaptive timeout, no heartbeat, and no backpressure handling. On lossy networks (cellular hotspots, conference Wi-Fi, cross-continent paths), commands silently fail or timeout unnecessarily. The existing `resilient-transport` change covers ICE/connection-level resilience but not data channel protocol reliability.

## What Changes

Upgrade the CommandClient protocol with: (1) EWMA RTT estimation for adaptive retransmission timeout, (2) 15-second heartbeat ping/pong with 3-strike failure detection, (3) SCTP ordered delivery with `maxPacketLifetime: 3000`, and (4) backpressure-aware queuing when `bufferedAmount` exceeds 64KB. All changes are in `lib/channel/commandClient.ts` and `lib/transport/WebRtcTransport.ts` — no signaling server or phone-side changes required.

## Capabilities

### New Capabilities
- `rtt-estimation`: EWMA-based round-trip time tracking for adaptive retransmission timeout
- `heartbeat-protocol`: 15s ping/pong on data channel with 3-strike failure detection and transport failover trigger
- `backpressure-queue`: Command queuing when `bufferedAmount > 64KB` with drain-based flush

### Existing Capabilities Modified
- `command-client`: Add RTT estimator, adaptive RTO, heartbeat send/response, backpressure-aware send
- `webrtc-transport`: Add SCTP ordered delivery configuration, heartbeat wiring, bufferedAmount monitoring
