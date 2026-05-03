## 1. Challenge Derivation — Browser Extension

- [ ] 1.1 Implement `challengeDerivation.ts` in `lib/webauthn/`: canonical TLV serialization of `Version(1) || zkTLS_Proof_Length(2) || zkTLS_Proof(var) || Origin_Length(2) || Origin(var) || Control_Code_Length(1) || Control_Code(4) || Session_Nonce(32) || Padding(var)` then SHA-256 hash
- [ ] 1.2 Implement TLV parsing function `parseChallengeComponents(serialized: Uint8Array): ChallengeComponents` for verification use on Android
- [ ] 1.3 Unit test: TLV serialization roundtrip — serialize then parse produces identical components
- [ ] 1.4 Unit test: same inputs produce same challenge hash (determinism)
- [ ] 1.5 Unit test: different session nonce produces different challenge (nonce binding)
- [ ] 1.6 Unit test: padding is canonical (deterministic to next 32-byte boundary, zero-filled)

## 2. WebAuthn Assertion with Custom Challenge

- [ ] 2.1 Implement `assertionRequest.ts` in `lib/webauthn/`: calls `navigator.credentials.get({ publicKey: { challenge: derivedChallenge, rpId, allowCredentials, userVerification: 'required', timeout: 60_000 } })`
- [ ] 2.2 Extract and serialize authenticator data, signature, clientDataJSON, and rawId from the assertion response
- [ ] 2.3 Add assertion state to Zustand store (`assertionStatus`, `assertionError`)
- [ ] 2.4 Implement assertion timeout handling (60s, show "Biometric verification timed out" in popup)
- [ ] 2.5 Unit test: assertion request options structure matches WebAuthn spec

## 3. Passkey Provisioning (Phase 0 Pairing)

- [ ] 3.1 Implement `passkeyProvisioning.ts` in `lib/webauthn/`: calls `navigator.credentials.create()` with ES256 (-7) algorithm, platform authenticator, resident key required
- [ ] 3.2 Add PRF extension to credential creation: `extensions: { prf: { eval: { first: new Uint8Array(32) } } }`
- [ ] 3.3 Transmit credential ID and public key bytes (raw coordinates) over transport channel to Android Vault
- [ ] 3.4 Implement `pairingCoordinator` integration: extend Phase 0 pairing flow to include passkey creation after SAS match
- [ ] 3.5 Handle passkey creation failure: fall back to PRF-only re-auth (existing flow)
- [ ] 3.6 Unit test: credential creation options structure is valid WebAuthn

## 4. Challenge Recomposition Engine — Android

- [ ] 4.1 Implement `ChallengeVerifier.java` in Android Vault: parse TLV-serialized components, verify zkTLS proof first, recompute SHA-256 hash
- [ ] 4.2 Decode `clientDataJSON.challenge` from base64url with canonical decoding (no padding variants)
- [ ] 4.3 Compare recomputed challenge against decoded assertion challenge; reject on mismatch with audit log
- [ ] 4.4 Implement session nonce uniqueness check: track recent nonces (last 100, LRU eviction) for replay prevention
- [ ] 4.5 Unit test: challenge verification passes with valid inputs
- [ ] 4.6 Unit test: challenge verification fails on mismatched origin, control code, or nonce

## 5. Assertion Signature Verification — Android

- [ ] 5.1 Implement `WebAuthnVerifier.java`: reconstruct ECDSA P-256 public key from stored raw coordinates (credential public key provisioned during pairing)
- [ ] 5.2 Verify assertion signature: `SHA256withECDSA` over `authenticatorData || SHA256(clientDataJSON)`
- [ ] 5.3 Store credential public key in Android trust-store during Phase 0 pairing (received from extension)
- [ ] 5.4 Handle key invalidation: if verification fails, log audit event and require re-provisioning
- [ ] 5.5 Unit test: valid assertion signature passes verification
- [ ] 5.6 Unit test: tampered `clientDataJSON.challenge` causes verification failure
- [ ] 5.7 Interop test: extension-generated assertion verifiable on Android using stored public key

## 6. Popup UI

- [ ] 6.1 Create `AuthPanel` updates: after zkTLS proof received, show transaction context (origin, control code) before biometric prompt
- [ ] 6.2 Show "Waiting for biometric verification..." during `navigator.credentials.get()` invocation
- [ ] 6.3 On success, show "Transaction verified via Challenge-Bound WebAuthn" with assertion details
- [ ] 6.4 Integrate with existing transaction flow: challenge-bound WebAuthn is the primary auth, PRF-only fallback for session resume

## 7. Integration & Testing

- [ ] 7.1 Integration test: full flow from zkTLS proof → challenge derivation → WebAuthn assertion → transport → Android verification
- [ ] 7.2 Integration test: end-to-end with usb-aoa-transport-proxy for Android-side assertion delivery
- [ ] 7.3 Integration test: end-to-end with WebRTC fallback (no USB tether)
- [ ] 7.4 E2E test: browser popup shows transaction context, user taps biometric, assertion is generated and verified
- [ ] 7.5 Run `bun run lint && bun run typecheck` and fix all issues
