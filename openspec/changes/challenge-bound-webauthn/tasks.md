## 1. Challenge Derivation — Browser Extension (Version 0x02)

- [x] 1.1 Implement `challengeDerivation.ts` in `lib/webauthn/`: canonical TLV serialization of `Version(1) || Tier(1) || TlsProof_Length(2) || TlsProof(var) || Origin_Length(2) || Origin(var) || Control_Code_Length(1) || Control_Code(4) || Session_Nonce(32) || Padding(var)` then SHA-256 hash
- [x] 1.2 Implement TLV parsing function `parseChallengeComponents(serialized: Uint8Array): ChallengeComponents` for verification use on Android
- [x] 1.3 Support version 0x02 with tier byte; reject version 0x01 with upgrade message
- [x] 1.4 Unit test: TLV serialization roundtrip — serialize then parse produces identical components
- [x] 1.5 Unit test: same inputs produce same challenge hash (determinism)
- [x] 1.6 Unit test: different session nonce produces different challenge (nonce binding)
- [x] 1.7 Unit test: padding is canonical (deterministic to next 32-byte boundary, zero-filled)
- [ ] 1.8 Unit test: tier byte correctly encodes and decodes for all three tiers

## 1B. TLS Binding Proof — Sec-Fetch Header Capture (Tier 1)

- [ ] 1B.1 Create `lib/tlsBinding/secFetchCapture.ts`: register `chrome.webRequest.onHeadersReceived` listener filtering `main_frame` requests
- [ ] 1B.2 Extract `Sec-Fetch-Site`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode` headers from response
- [ ] 1B.3 Store captured headers keyed by tabId in `chrome.storage.session` for later challenge derivation
- [ ] 1B.4 Implement `computePageContentHash(tabId)`: inject content script to get visible DOM text → SHA-256
- [ ] 1B.5 Unit test: headers are captured and stored per tab
- [ ] 1B.6 Unit test: content hash changes on DOM mutation
- [ ] 1B.7 Integration test: full Tier 1 flow from page load → header capture → challenge derivation

## 1C. TLS Binding Proof — Token Binding (Tier 2)

- [ ] 1C.1 Create `lib/tlsBinding/tokenBinding.ts`: WebTransport connection to `/.well-known/token-binding`
- [ ] 1C.2 Capture TLS channel ID from WebTransport datagram
- [ ] 1C.3 Combine Tier 1 + Tier 2 proof into single TLS binding payload
- [ ] 1C.4 Unit test: graceful degradation when endpoint unavailable
- [ ] 1C.5 Integration test: full Tier 2 flow when endpoint present

## 1D. TLS Binding Proof — DECO WASM Oracle (Tier 3, Deferred)

- [ ] 1D.1 Create `lib/tlsBinding/decoOracle.ts`: WASM oracle invocation in offscreen document
- [ ] 1D.2 WASM module watches bank's HTTP response, produces succinct proof
- [ ] 1D.3 Cache proofs per-session (they're expensive)
- [ ] 1D.4 Unit test: proof verification with known test vector
- [ ] 1D.5 Integration test: full Tier 3 flow with notary server stub

## 2. WebAuthn Assertion with Custom Challenge

- [x] 2.1 Implement `assertionRequest.ts` in `lib/webauthn/`: calls `navigator.credentials.get({ publicKey: { challenge: derivedChallenge, rpId, allowCredentials, userVerification: 'required', timeout: 60_000 } })`
- [x] 2.2 Extract and serialize authenticator data, signature, clientDataJSON, and rawId from the assertion response
- [x] 2.3 Add assertion state to Zustand store (`assertionStatus`, `assertionError`)
- [x] 2.4 Implement assertion timeout handling (60s, show "Biometric verification timed out" in popup)
- [x] 2.5 Unit test: assertion request options structure matches WebAuthn spec

## 3. Passkey Provisioning (Phase 0 Pairing)

- [x] 3.1 Implement `passkeyProvisioning.ts` in `lib/webauthn/`: calls `navigator.credentials.create()` with ES256 (-7) algorithm, platform authenticator, resident key required
- [x] 3.2 Add PRF extension to credential creation: `extensions: { prf: { eval: { first: new Uint8Array(32) } } }`
- [x] 3.3 Transmit credential ID and public key bytes (raw coordinates) over transport channel to Android Vault
- [x] 3.4 Implement `pairingCoordinator` integration: extend Phase 0 pairing flow to include passkey creation after SAS match
- [x] 3.5 Handle passkey creation failure: fall back to PRF-only re-auth (existing flow)
- [x] 3.6 Unit test: credential creation options structure is valid WebAuthn

## 4. Challenge Recomposition Engine — Android

- [x] 4.1 Implement `ChallengeVerifier.java` in Android Vault: parse TLV-serialized components (version 0x02), verify TLS binding proof per tier, recompute SHA-256 hash
- [x] 4.2 Decode `clientDataJSON.challenge` from base64url with canonical decoding (no padding variants)
- [x] 4.3 Compare recomputed challenge against decoded assertion challenge; reject on mismatch with audit log
- [x] 4.4 Implement session nonce uniqueness check: track recent nonces (last 100, LRU eviction) for replay prevention
- [ ] 4.5 Implement tier policy enforcement: minimum tier per RP domain, reject proofs below threshold
- [x] 4.6 Unit test: challenge verification passes with valid inputs (all tiers)
- [x] 4.7 Unit test: challenge verification fails on mismatched origin, control code, or nonce
- [ ] 4.8 Unit test: insufficient tier causes rejection

## 5. Assertion Signature Verification — Android

- [x] 5.1 Implement `WebAuthnVerifier.java`: reconstruct ECDSA P-256 public key from stored raw coordinates (credential public key provisioned during pairing)
- [x] 5.2 Verify assertion signature: `SHA256withECDSA` over `authenticatorData || SHA256(clientDataJSON)`
- [x] 5.3 Store credential public key in Android trust-store during Phase 0 pairing (received from extension)
- [x] 5.4 Handle key invalidation: if verification fails, log audit event and require re-provisioning
- [x] 5.5 Unit test: valid assertion signature passes verification
- [x] 5.6 Unit test: tampered `clientDataJSON.challenge` causes verification failure
- [x] 5.7 Interop test: extension-generated assertion verifiable on Android using stored public key

## 6. Popup UI

- [x] 6.1 Create `AuthPanel` updates: after TLS binding proof received, show transaction context (origin, control code) before biometric prompt
- [x] 6.2 Show "Waiting for biometric verification..." during `navigator.credentials.get()` invocation
- [x] 6.3 On success, show "Transaction verified via Challenge-Bound WebAuthn" with assertion details and proof tier
- [x] 6.4 Integrate with existing transaction flow: challenge-bound WebAuthn is the primary auth, PRF-only fallback for session resume

## 7. Integration & Testing

- [x] 7.1 Integration test: full flow from zkTLS proof → challenge derivation → WebAuthn assertion → transport → Android verification (stub)
- [x] 7.2 Integration test: end-to-end with usb-aoa-transport-proxy for Android-side assertion delivery (stub)
- [x] 7.3 Integration test: end-to-end with WebRTC fallback (no USB tether) (stub)
- [x] 7.4 E2E test: browser popup shows transaction context, user taps biometric, assertion is generated and verified (stub)
- [x] 7.5 Run `bun run lint && bun run typecheck` and fix all issues
- [x] 7.6 E2E test: full challenge-bound WebAuthn assertion cycle (commit: a7c6157d)
