## Why

The signaling server is currently a thin Socket.IO relay with no access control, no version negotiation, and no operational visibility. Anyone who guesses or observes a 6-digit SAS code can join a room and observe SDP exchanges.

Additionally, the Noise XX handshake protocol version is hardcoded (`PROTOCOL_VERSION = new Uint8Array([0x01])`) with no negotiation path. If the Android app ships with a different protocol version, pairing silently fails. And the server has no metrics or monitoring — making production incidents invisible.

The solution adds three layers:
1. **Commitment-based room access** (existing): QR code encodes `SHA-256(extensionStaticKey || nonce || sasCode)` — only the phone that scanned the QR can compute the correct commitment and join the room.
2. **Protocol version + capability negotiation**: Handshake message 1 carries capability flags (protocol version, supported features, transports) — both sides negotiate to the intersection.
3. **Prometheus metrics + structured logging**: Production observability for connection counts, pairing duration, ICE failures.

## What Changes

- **Commitment-based room access** (existing): Extension computes a 32-byte random nonce; QR encodes the commitment; phone sends commitment to join; server rejects mismatches.
- **Protocol version negotiation**: `PROTOCOL_VERSION` byte is no longer hardcoded. The handshake message 1 payload carries encoded capabilities: `{ protocolVersion: 1, features: ['prf', 'challenge-bound-v1', 'credential-provision'], supportedTransports: ['webrtc', 'usb'] }`. The responder (phone) replies with its own capabilities. Post-handshake, both sides negotiate to `intersection(myFeatures, theirFeatures)`.
- **Capability flags in room registration**: Extension includes its capabilities when creating a room (`register-room` event). The server echoes them to joining peers.
- **Prometheus metrics endpoint**: Server exposes `GET /metrics` with counters for connections, pairing duration histogram, ICE failure count, and room lifecycle events.
- **Structured logging**: Replace `console.log` with structured JSON logging (log level, timestamp, request ID) for log aggregation.

## Capabilities

### New Capabilities

- `commitment-based-room-access`: QR-bound cryptographic commitment prevents unauthorized room joins
- `protocol-version-negotiation`: Capability flags exchanged during Noise handshake, negotiated to intersection
- `prometheus-metrics`: `/metrics` endpoint for production observability
- `structured-logging`: JSON-structured logs with level, timestamp, correlation ID

### Modified Capabilities

- `signaling-server`: Added commitment verification, capability relay, metrics endpoint
- `qr-encoding`: QR payload extended with nonce + commitment fields
- `noise-handshake`: Handshake message 1 carries capability payload instead of empty bytes

## Impact

- **Signaling server** (`signaling-server/server.js`): ~50 lines added for commitment verification, ~30 lines for capabilities relay, ~40 lines for Prometheus endpoint. Total ~200 lines added.
- **Browser extension**: `lib/channel/capabilities.ts` — new utility for encoding/decoding capability flags. `pairingCoordinator.ts` — embed capabilities in handshake message 1.
- **Android**: Extract capabilities from handshake message 1, respond with own capabilities, negotiate intersection.
- **Operations**: Prometheus metrics ingested by Grafana Cloud or self-hosted Prometheus + Grafana. Structured logs shipped to Loki or similar.
- **Performance**: Commitment verification is O(1) hash comparison. Protocol version negotiation adds <1ms.

## Dependencies

- Commitment verification: Requires QR encoding change (add `nonce` + `commitment` fields). QR backward compatible — older phone apps can still parse the URL (commitment field is optional in parsing, required by server).
- Prometheus: Requires `prom-client` npm package. No external service dependency — server runs its own metrics endpoint.
- Protocol negotiation: Requires Android app update to handle capability payload in handshake message 1.
