## 1. Update QR Code Generation

- [ ] 1.1 In `lib/channel/qrCode.ts`: generate 32-byte nonce via `crypto.getRandomValues()` during pairing initiation
- [ ] 1.2 Compute commitment: `SHA-256(extensionStaticKey || nonce || sasCode)` using `crypto.subtle.digest`
- [ ] 1.3 Include `commitment` and `nonce` in pairing URL payload alongside `roomId` and `sasCode`
- [ ] 1.4 Update `buildPairingUrl()` to accept and encode commitment parameter
- [ ] 1.5 Unit test: commitment is deterministic given same inputs; changes when any input changes

## 2. Update Signaling Server

- [ ] 2.1 Add room metadata storage in `signaling-server/server.js`: Map of `roomId → { sasCode, nonce, extensionStaticKey }`
- [ ] 2.2 Add `register-room` event handler: extension sends `{ sasCode, nonce, extensionStaticKey, roomId }`; server stores in room metadata
- [ ] 2.3 Modify `join-room` handler: read `commitment` from `socket.handshake.query`; compute expected commitment; reject with `{ error: 'invalid_commitment' }` if mismatch
- [ ] 2.4 Add metadata cleanup on room TTL expiry (30s after creator disconnects)
- [ ] 2.5 Verify signaling server tests pass

## 3. Update Phone Companion (Android)

- [ ] 3.1 Phone reads `commitment` and `nonce` from QR code
- [ ] 3.2 Phone sends `commitment` in `join-room` query parameters

## 4. Final Verification

- [ ] 4.1 E2E test: valid pairing completes with commitment-based join
- [ ] 4.2 E2E test: direct room join without commitment is rejected
- [ ] 4.3 Run `bun run lint && bun run typecheck && bun run test` — all pass
