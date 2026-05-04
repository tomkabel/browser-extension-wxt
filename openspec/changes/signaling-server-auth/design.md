## Context

The signaling server (`signaling-server/server.js`) uses Socket.IO rooms identified by a 6-digit numeric code (or 3-emoji SAS). Any client that knows this code can join the room: `socket.join(roomId)`. While the Noise XX handshake inside the WebRTC data channel provides E2EE, a signaling-level attacker who intercepts the QR code can: (1) connect to the signaling room first, (2) observe connection timings, (3) exhaust TURN credentials by requesting them for the room.

## Goals / Non-Goals

**Goals:**
- Prevent unauthorized clients from joining a signaling room
- No additional user interaction (no extra code to type, no second QR scan)
- Backward compatible with existing WebRTC and Noise protocol layers
- Minimal server-side change (~20 lines)

**Non-Goals:**
- Replacing the Noise XX handshake (that's already secure)
- Encrypting signaling messages (the data channel payloads are Noise-encrypted)
- Rate limiting or DDoS protection (separate concern)

## Decisions

### Decision 1: Commitment-based room access

During pairing, the extension generates a random nonce (32 bytes) and computes:
```
commitment = SHA-256(extensionStaticKey || nonce || sasCode)
```
The QR code encodes `{ roomId, sasCode, nonce, commitment }`. (The SAS code is already in the QR for the phone to display.)

When the phone joins the room, it sends an additional `commitment` field in the `join-room` event. The server computes `expected = SHA-256(extensionStaticKey || nonce || sasCode)` using the room's registered values and verifies:
- `commitment === expected`
- `sasCode` matches the room's registered code (set by extension on room creation)

If either check fails, the connection is rejected with `{ error: 'invalid_commitment' }`.

### Decision 2: Room registration during extension's join

When the extension creates the room, it sends a `register-room` event containing the SAS code, nonce, and extension's static public key. These are stored in the room's metadata. The server now requires both the room ID and valid commitment to join.

## Risks / Trade-offs

- [Risk] An attacker who observes the QR code can read the SAS code directly. But the commitment uses SHA-256 of the static key + nonce + SAS. Without the static key (which never leaves the extension), the attacker cannot compute the correct commitment.
- [Risk] The nonce must be randomly generated. If the RNG is predictable, an attacker could precompute commitments. Mitigation: use `crypto.getRandomValues()` (CSPRNG in all modern browsers).
