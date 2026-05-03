## 1. Bank Coordination

- [ ] 1.1 Contact each whitelisted RP (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee) to request adding `SmartID-Attestation` header to their Smart-ID login response
- [ ] 1.2 Specify the header format: `SmartID-Attestation: v1;<base64url(json)>;<base64url(sig)>;<key-id>` with JSON payload `{"code":"...","session":"...","ts":...}`
- [ ] 1.3 For each RP, exchange ECDSA P-256 public keys on a trusted channel (signed email or in-person)
- [ ] 1.4 Request the attestation header be scoped to Smart-ID login responses only (not all pages)

## 2. Service Worker Attestation Verifier

- [ ] 2.1 Implement `chrome.webRequest.onHeadersReceived` listener for whitelisted RP domains with `["responseHeaders", "extraHeaders"]`
- [ ] 2.2 Implement `parseAttestationHeader()`: split by `;`, base64url-decode payload and signature, parse JSON
- [ ] 2.3 Implement `buildTrustedRpKeyStore()`: import bundled ECDSA P-256 keys via `crypto.subtle.importKey()` with `{ name: 'ECDSA', namedCurve: 'P-256' }`
- [ ] 2.4 Implement `verifyAttestationSignature()`: `crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, signature, payloadBytes)`
- [ ] 2.5 Dispatch attested control code to the control code verification pipeline on success
- [ ] 2.6 Handle missing/invalid header: return null, do NOT block the page load
- [ ] 2.7 Unit test: valid attestation header with correct ECDSA P-256 signature passes verification
- [ ] 2.8 Unit test: invalid signature (tampered payload) fails verification
- [ ] 2.9 Unit test: unknown key-id returns null (graceful degradation)
- [ ] 2.10 Implement timestamp validation: reject attestation if |now - ts| > 30 seconds, with graceful fallback to DOM-only mode

## 3. TrustedRpSigningKey Manifest

- [ ] 3.1 Create initial `TrustedRpSigningKey` manifest JSON file bundled with the extension: 4 domains × 1-2 keys each
- [ ] 3.2 Implement manifest loading: import bundled keys at extension startup
- [ ] 3.3 Implement background key refresh: fetch signed manifest from extension update server, verify manifest signature, apply updates
- [ ] 3.4 Implement manifest rollback protection: reject version <= last-seen, persist last-seen version per key
- [ ] 3.5 Implement manual key refresh trigger in popup
- [ ] 3.6 Unit test: manifest with tampered entries is rejected
- [ ] 3.7 Unit test: key rotation with overlap window works (both old and new keys accepted during overlap)

## 4. Control Code Verification Pipeline

- [ ] 4.1 Implement `verifyControlCode()`: receive attested code from attestation verifier, compare with DOM-scraped code
- [ ] 4.2 On match: dispatch `attestation-verified` event with the control code for WebAuthn challenge binding
- [ ] 4.3 On mismatch: flag as potential RAT attack, display security warning in popup, use attested code (not DOM code)
- [ ] 4.4 On attestation unavailable: use DOM code only, display "DOM-only verification (no server attestation)" in popup
- [ ] 4.5 Log audit events: log salted hashes of codes, never plaintext
- [ ] 4.6 Unit test: matching codes pass verification
- [ ] 4.7 Unit test: mismatching codes trigger security flag
- [ ] 4.8 Unit test: fallback works when attestation is unavailable

## 5. Android Attestation Verification

- [ ] 5.1 Implement `AttestationVerifier.java` in Android Vault: parse the attested code payload, verify ECDSA P-256 signature using `java.security.Signature` with `SHA256withECDSA`
- [ ] 5.2 Bundle `TrustedRpSigningKey` public keys in the Android companion app (or deliver via the transport layer's signed manifest)
- [ ] 5.3 Extract attested control code from verified payload
- [ ] 5.4 Handle verification failure: reject session, log audit event, do NOT proceed with WebAuthn challenge
- [ ] 5.5 Unit test: valid ECDSA P-256 signature verifies successfully
- [ ] 5.6 Unit test: tampered signature fails verification
- [ ] 5.7 Unit test: expired key (beyond notAfter) fails verification
- [ ] 5.8 Implement session identifier matching: Android Vault rejects attestation if session does not match current WebAuthn transaction
- [ ] 5.9 Implement timestamp validation in Android Vault: reject attestation if |now - ts| > 30 seconds

## 6. Integration & Testing

- [ ] 6.1 Integration test: full attestation flow: RP page → webRequest intercept → header parse → ECDSA verify → cross-reference → transport → Android verify
- [ ] 6.2 Integration test: non-whitelisted domain does NOT trigger attestation listener
- [ ] 6.3 Integration test: attestation failure gracefully falls back to DOM-only mode
- [ ] 6.4 E2E test: Smart-ID login on lhv.ee with attestation completes within normal page load time
- [ ] 6.5 E2E test: popup shows correct attestation status (verified / DOM-only / RAT-detected)
- [ ] 6.6 Manual QA: verify control code appears on both Smart-ID app and extension popup
- [ ] 6.7 Run `bun run lint && bun run typecheck` and fix all issues
