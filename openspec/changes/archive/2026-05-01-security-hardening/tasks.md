## 1. CSP Hardening

- [x] 1.1 Update `wxt.config.ts` CSP: narrow to `connect-src 'self' https://<signaling-server> wss://<signaling-server>`
- [x] 1.2 Remove `ws://localhost:*` and `wss://*` wildcards
- [x] 1.3 Test that WebRTC still works (data channels use ICE candidates, not CSP-controlled URLs)
- [x] 1.4 Verify CSP violations are caught with CSP reporting

## 2. Noise Property Tests

- [x] 2.1 Write round-trip test: encrypt 1000 random payloads, verify each decrypts correctly
- [x] 2.2 Write wrong-key test: verify decryption fails with wrong key
- [x] 2.3 Write sequence monotonicity test: verify nonces increment by exactly 1
- [x] 2.4 Write key rotation test: verify HKDF derivation produces valid new cipher state

## 3. Interop Test

- [x] 3.1 Start TypeScript Noise XX initiator with known keypair
- [x] 3.2 Start Java Noise XX responder with corresponding keypair
- [x] 3.3 Complete handshake; verify both sides produce identical cipher states
- [x] 3.4 Exchange test messages: encrypt on one side, decrypt on the other

## 4. Wycheproof Vectors

- [x] 4.1 Obtain Google's Wycheproof test vectors for ChaCha20-Poly1305
- [x] 4.2 Run vectors against @noble/ciphers ChaCha20-Poly1305 implementation
- [x] 4.3 Run vectors against lazysodium-java ChaCha20-Poly1305 implementation (via libsodium)

## 5. Noise Test Vectors

- [x] 5.1 Obtain official Noise Protocol test vectors for XX pattern
- [x] 5.2 Obtain official Noise Protocol test vectors for IK pattern
- [x] 5.3 Run both against TS and Java implementations; all must pass

## 6. Penetration Test Plan

- [x] 6.1 Document replay attack scenario and verify sequence number protection
- [x] 6.2 Document signaling MITM scenario and verify Noise authentication prevents it
- [x] 6.3 Document QR relay attack scenario and verify SAS confirmation mitigates it
- [x] 6.4 Document session hijacking scenario and verify chrome.storage.session isolation
- [x] 6.5 Document SW restart scenario and verify session restoration

## 7. E2E Integration Tests

- [x] 7.1 Write Playwright test: open popup → pair → MFA → detect transaction → send command
- [x] 7.2 Document adb-based phone interaction for E2E testing
