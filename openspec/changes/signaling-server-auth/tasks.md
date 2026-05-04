## 1. Update QR Code Generation

- [x] 1.1 In `lib/channel/qrCode.ts`: generate 32-byte nonce via `crypto.getRandomValues()` during pairing initiation
- [x] 1.2 Compute commitment: `SHA-256(extensionStaticKey || nonce || sasCode)` using `crypto.subtle.digest`
- [x] 1.3 Include `commitment` and `nonce` in pairing URL payload alongside `roomId` and `sasCode`
- [x] 1.4 Update `buildPairingUrl()` to accept and encode commitment parameter
- [x] 1.5 Unit test: commitment is deterministic given same inputs; changes when any input changes

## 2. Update Signaling Server

- [x] 2.1 Add room metadata storage in `signaling-server/server.js`: Map of `roomId → { sasCode, nonce, extensionStaticKey }`
- [x] 2.2 Add `register-room` event handler: extension sends `{ sasCode, nonce, extensionStaticKey, roomId }`; server stores in room metadata
- [x] 2.3 Modify `join-room` handler: read `commitment` from `socket.handshake.query`; compute expected commitment; reject with `{ error: 'invalid_commitment' }` if mismatch
- [x] 2.4 Add metadata cleanup on room TTL expiry (30s after creator disconnects)
- [x] 2.5 Verify signaling server tests pass

## 3. Update Phone Companion (Android)

- [x] 3.1 Phone reads `commitment` and `nonce` from QR code
- [x] 3.2 Phone sends `commitment` in `join-room` query parameters

## 4. Final Verification

- [x] 4.1 E2E test: valid pairing completes with commitment-based join
- [x] 4.2 E2E test: direct room join without commitment is rejected
- [x] 4.3 Run `bun run lint && bun run typecheck && bun run test` — all pass
