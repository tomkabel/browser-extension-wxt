## 1. TLSNotary Licensing & Audit

- [ ] 1.1 Verify TLSNotary license permits WASM compilation and commercial use (review LICENSE file, check for GPL/AGPL restrictions)
- [ ] 1.2 If TLSNotary license is restrictive, evaluate DECO (Stanford) as alternative — DECO does not require a Notary server
- [ ] 1.3 Document licensing decision in `research/zktls-licensing.md`

## 2. WASM Module Build Pipeline

- [ ] 2.1 Set up Rust toolchain with `wasm-pack` target in the project build system
- [ ] 2.2 Create Rust crate for TLSNotary MPC prover with minimum feature set (TLS 1.3 observation, transcript commitment, proof generation)
- [ ] 2.3 Add WASM compilation step to `wxt.config.ts` build pipeline (lazy-loaded, not in initial bundle)
- [ ] 2.4 Configure Offscreen Document cross-origin headers to support `SharedArrayBuffer` (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy)
- [ ] 2.5 Verify WASM binary size target: <2MB gzipped
- [ ] 2.6 Unit test: WASM module loads and initializes in Offscreen Document context

## 3. Offscreen Document Prover Host

- [ ] 3.1 Create `entrypoints/offscreen/zktls-prover.ts`: loads WASM module, manages prover lifecycle, exposes message API
- [ ] 3.2 Implement `startNotarization(rpDomain: string, sessionNonce: Uint8Array)`: triggers TLS 1.3 handshake observation
- [ ] 3.3 Implement `generateProof(controlCode: string)`: generates ZKP that control code appears in attested transcript
- [ ] 3.4 Implement proof serialization to compact binary format (<4KB target)
- [ ] 3.5 Implement progress events: send status updates to background script during proof generation (~100-500ms)
- [ ] 3.6 Handle notarization failure: return error with cause (TLS version mismatch, timeout, Notary unavailable)

## 4. Control Code Verification Pipeline

- [ ] 4.1 Implement `verifyControlCode()` in extension: extract attested control code from zkTLS proof
- [ ] 4.2 Cross-reference attested code with DOM-scraped code: if mismatch, flag as potential RAT attack
- [ ] 4.3 Implement `TrustedRpKey` manifest: domain → TLS certificate public key mapping for whitelisted RPs (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)
- [ ] 4.4 Implement automatic key refresh: fetch signed key manifest from extension update server; fall back to bundled keys
- [ ] 4.5 Unit test: control code verification passes for matching attested/DOM codes
- [ ] 4.6 Unit test: control code mismatch triggers security flag

## 5. Android ZKP Verification

- [ ] 5.1 Implement `ZkProofVerifier.java` in Android Vault: parse serialized proof, verify against RP TLS certificate public key
- [ ] 5.2 Extract attested control code from verified proof
- [ ] 5.3 Handle proof verification failure: reject session, log audit event
- [ ] 5.4 Unit test: valid proof verifies successfully
- [ ] 5.5 Unit test: proof with tampered control code fails verification

## 6. Performance Budget Implementation

- [ ] 6.1 Measure WASM module load time (cold, from `chrome.storage.local`): target <500ms
- [ ] 6.2 Measure TLS 1.3 handshake observation time: target <200ms
- [ ] 6.3 Measure ZKP generation time: target <1000ms
- [ ] 6.4 Implement lazy loading: only load WASM module when whitelisted RP domain is detected
- [ ] 6.5 Cache WASM binary using binary-native storage after first load: prefer IndexedDB (store as Blob/ArrayBuffer in an "wasm-cache" object store, retrieve via get()) or the Cache API from the extension service worker (fetch/cache the .wasm response); avoid chrome.storage.local due to its 5MB quota and JSON serialization overhead (base64-encoding)

## 7. Integration & Testing

- [ ] 7.1 Integration test: full zkTLS flow: RP page → offscreen prover → proof generation → proof serialization → transport → Android verification
- [ ] 7.2 Integration test: non-whitelisted domain does NOT trigger zkTLS (saves battery/CPU)
- [ ] 7.3 Integration test: WebRTC fallback works when zkTLS proof fails (graceful degradation)
- [ ] 7.4 E2E test: Smart-ID login on lhv.ee with zkTLS attestation completes within 2s total latency budget
- [ ] 7.5 Manual QA: verify control code appears on both Smart-ID app and extension popup
- [ ] 7.6 Run `bun run lint && bun run typecheck` and fix all issues
