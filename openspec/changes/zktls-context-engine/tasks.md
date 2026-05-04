## 0. Progressive Tier System Foundation

- [ ] 0.1 Create `lib/tlsBinding/` directory structure with `index.ts`, `types.ts`
- [ ] 0.2 Define `TlsBindingProof` interface with tier, secFetch payload, optional tokenBinding, optional decoProof fields
- [ ] 0.3 Implement `TierNegotiator` class: determines highest available tier based on RP config, browser capabilities, and timeout

## 1. Tier 1 — Sec-Fetch Header Capture

- [ ] 1.1 Create `lib/tlsBinding/secFetchCapture.ts`: register `chrome.webRequest.onHeadersReceived` listener
- [ ] 1.2 Filter for `main_frame` requests, extract `Sec-Fetch-Site`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`
- [ ] 1.3 Store captured headers keyed by tabId in `chrome.storage.session`
- [ ] 1.4 Implement per-tab content hash computation via content script injection
- [ ] 1.5 Handle SPA navigation: trigger content hash recomputation on `wxt:locationchange`
- [ ] 1.6 Unit test: headers captured on main_frame navigation
- [ ] 1.7 Unit test: content hash changes on DOM mutation
- [ ] 1.8 Unit test: SPA navigation reuses stored headers, recalculates content hash

## 2. Tier 2 — WebTransport Token Binding

- [ ] 2.1 Create `lib/tlsBinding/tokenBinding.ts`: WebTransport connection to `/.well-known/token-binding`
- [ ] 2.2 Run from offscreen document (WebTransport requires a document context)
- [ ] 2.3 Capture TLS channel ID and serialize as Tier 2 proof
- [ ] 2.4 Handle connection failure gracefully: return empty proof, allow Tier 1 fallback
- [ ] 2.5 Unit test: connection to stub endpoint produces valid proof
- [ ] 2.6 Unit test: connection failure returns empty proof without throwing

## 3. Tier 3 — Signed Header Attestation & DECO Oracle

- [x] 3.1 Create `lib/attestation/` directory with `headerParser.ts`, `verifier.ts`, `keyStore.ts`, `env.ts`
- [x] 3.2 Implement `SmartID-Attestation` header parser: format `v1;<base64url(payload)>;<base64url(sig)>;<key-id>`
- [x] 3.3 Implement `verifier.ts`: `crypto.subtle.verify()` with ECDSA P-256, SHA-256
- [x] 3.4 Implement `keyStore.ts`: load and cache `TrustedRpSigningKey` from bundled manifest
- [x] 3.5 Implement demo key management: 4 unique ECDSA P-256 key pairs in `trusted-rp-keys.json`
- [x] 3.6 Implement `demoAttestation.ts`: local signed header generation in dev/demo mode
- [x] 3.7 Create `lib/attestation/audit.ts`: attestation audit logging with minimal field set
- [ ] 3.8 Create `lib/tlsBinding/decoOracle.ts`: WASM oracle driver (deferred to Phase 3)
- [ ] 3.9 WASM oracle observes bank's HTTP response, produces succinct proof
- [ ] 3.10 Cache proofs per-session (max 5, 30s TTL)

## 4. Control Code Verification Pipeline

- [x] 4.1 Create `lib/attestation/headerParser.ts`: extract header value, parse format, handle malformed headers
- [x] 4.2 Implement `controlCodeVerifier.ts`: extract attested code from binding proof (any tier)
- [x] 4.3 DOM code scraper: extract control code from page DOM (selector-based)
- [x] 4.4 Cross-reference logic: compare attested vs DOM code; on mismatch, prefer attested
- [x] 4.5 `VERIFIED_MATCH`: attested matches DOM → use attested for challenge
- [x] 4.6 `VERIFIED_MISMATCH`: different from DOM → display "RAT Activity Detected" warning, use attested
- [x] 4.7 `HEADER_UNAVAILABLE`: no header (Tier 1 only) → use DOM code, log "Attestation not available"
- [x] 4.8 `SIGNATURE_FAILED`: verification error → fall back to Tier 1 binding, log security event

## 5. TrustedRpSigningKey Manifest

- [x] 5.1 Define TrustedRpSigningKey interface: `{ domain, keyId, publicKeyJwk, algorithm, notBefore, notAfter }`
- [x] 5.2 Bundle key manifest in extension source: `lib/attestation/trusted-rp-keys.json`
- [x] 5.3 Include 4 demo domains with 1-2 keys each (LHV, Swedbank, SEB, TARA)
- [x] 5.4 Keys are dedicated ECDSA P-256 signing keys (NOT TLS certificate keys)
- [x] 5.5 Implement key rotation: `keyStore.ts` supports multiple keys per domain, selects by `keyId`
- [x] 5.6 Implement key refresh: periodic fetch from update server with manifest signature verification
- [x] 5.7 Implement rollback protection: manifest version monotonic counter, reject older versions

## 6. Android Attestation Verification

- [ ] 6.1 Implement `AttestationVerifier.java` for Tier 3: ECDSA P-256 using Java `Signature` + `KeyFactory`
- [ ] 6.2 Bundle same `TrustedRpSigningKey` public keys in Android APK (in `res/raw/`)
- [ ] 6.3 Implement `TlsBindingVerifier.java` for Tier 1/2: validate Sec-Fetch structure, verify content hash
- [ ] 6.4 Implement tier policy enforcement: `RPPolicyStore` maps domain → minimumTier
- [ ] 6.5 Unit test: Tier 1 proof verified
- [ ] 6.6 Unit test: Tier 2 proof verified (with Token Binding stub)
- [ ] 6.7 Unit test: Tier 3 signed attestation verified (ECDSA P-256)
- [ ] 6.8 Unit test: proof below minimum tier rejected
- [ ] 6.9 Unit test: corrupted proof rejected (all tiers)

## 7. Integration & Testing

- [x] 7.1 Unit test: demo key generation produces valid ECDSA P-256 keys
- [x] 7.2 Unit test: header payload signed by demo key verifies on extension side
- [x] 7.3 Unit test: full Tier 3 demo pipeline (key gen → sign → parse → verify → cross-reference)
- [x] 7.4 Unit test: tampered payload fails verification
- [x] 7.5 Unit test: tampered signature fails verification
- [x] 7.6 Unit test: unknown key-id returns error
- [x] 7.7 Unit test: expired key (notBefore, notAfter) returns error
- [ ] 7.8 Integration test: Tier 1 end-to-end (page load → header capture → content hash → challenge)
- [ ] 7.9 Integration test: tier auto-negotiation (Tier 3 unavailable → Tier 2 fail → Tier 1)
- [ ] 7.10 E2E test: browser popup shows attestation tier indicator
- [ ] 7.11 E2E test: RAT simulation — DOM mutated after attestation → mismatch flag triggered
