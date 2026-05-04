## Why

The signaling server at `signaling-server/server.js` allows any client to join any room by knowing only the room ID. While E2EE via Noise protects message content, the lack of access control enables DoS attacks (room flooding, TURN credential exhaustion) and allows an attacker who intercepts the QR code (e.g., via shoulder surfing) to connect to the signaling room before the legitimate phone, performing a signaling-level MitM.

## What Changes

Add commitment-based room access to the signaling server. The QR code encodes `SHA-256(extensionStaticKey || nonce || sasCode)` as a commitment. The phone must prove knowledge of the SAS code by sending the matching commitment. The server rejects connections that don't satisfy the challenge. This is a ~20-line addition to the signaling server that eliminates room hijacking without changing the WebRTC or Noise protocol layers.

## Capabilities

### New Capabilities
- `commitment-room-access`: HMAC-based room access control — extension generates commitment during pairing, phone proves SAS knowledge before joining, server verifies and rejects invalid joiners

### Existing Capabilities Modified
- `signaling-server`: Add commitment verification to `join-room` handler; room metadata includes expected commitment
- `qr-encoding`: Add commitment field to QR code payload format
