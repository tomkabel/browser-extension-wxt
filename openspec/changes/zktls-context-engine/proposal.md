## Why

V6's core security innovation is cryptographic Context Attestation. Current browser extensions have no way to prove what the server actually transmitted — they trust the DOM, which a RAT can manipulate arbitrarily. ECDSA P-256 signed response headers allow the extension to verify that a specific string (the control code) was authored by the bank's server. A local RAT cannot forge this because it lacks the bank's private signing key.

The original design specified TLSNotary (a WASM-compiled MPC prover) for this purpose. After deep analysis, TLSNotary was replaced because:

1. **Unresolved TLS witness architecture**: The prover "observes the TLS 1.3 handshake between the browser and the RP server" — extension APIs cannot observe the browser's TLS connection plaintext.
2. **AGPL licensing risk**: TLSNotary was historically AGPL-licensed, potentially incompatible with a proprietary extension.
3. **Notary server requirement**: TLSNotary requires a third-party MPC participant (Notary server) — additional infrastructure, latency, and attack surface.
4. **WASM binary size**: ~2MB gzipped added to the extension bundle; requires SharedArrayBuffer with COOP/COEP headers in the Offscreen Document.
5. **Latency**: 1-2s for ZKP generation + Notary round trip vs <20ms for signature verification.

The replacement — `SmartID-Attestation` response header signed with ECDSA P-256 — provides equivalent security guarantees (a RAT cannot forge a valid signature) with dramatically lower complexity: pure TypeScript, ~200 bytes bundle impact, zero additional latency, and no external dependencies.

## What Changes

- **No WASM module**: Removed entirely. No TLSNotary compilation, no Offscreen Document prover host.
- **`SmartID-Attestation` Header Verification**: The extension intercepts response headers from whitelisted RPs via `chrome.webRequest.onHeadersReceived`. Verifies ECDSA P-256 signatures using `crypto.subtle.verify()`.
- **`TrustedRpSigningKey` Manifest**: Bundles ECDSA P-256 public keys for each whitelisted RP domain. Supports multiple keys per domain for rotation overlap. Keys are dedicated signing keys (not TLS certificate keys).
- **Control Code Verification Pipeline**: Extracts the attested control code from the signed header, cross-references with DOM-scraped code. On mismatch, uses attested code (not DOM code) — maximum security.
- **Proof Transport**: The attested control code, signature, and key ID are sent to the Android Vault over existing USB/WebRTC transport. The Android Vault re-verifies the signature before using as WebAuthn challenge input.

## Capabilities

### New Capabilities

- `signed-header-attestation`: (replaces `tlsnotary-wasm-prover`) Intercepts HTTP responses from whitelisted RPs, verifies ECDSA P-256 signed control code attestations in the `SmartID-Attestation` header
- `control-code-verification`: Pipeline that extracts the attested control code from the signed header and cross-references with DOM-scraped code
- `zkp-key-management`: Embedding and rotation of RP ECDSA P-256 signing keys for attestation verification

### Modified Capabilities

- Existing `domain-parser` and `content-script-detector` gain a new attestation layer — they now request signed header attestation alongside DOM scraping
- `offscreen-document-lifecycle` — No longer required for attestation (only for WebRTC)

## Impact

- **Browser extension**: `service-worker/` — new `attestation-verifier.ts` (~100 lines). `lib/attestation/` directory with key store, header parser, and verifier. Total bundle impact: ~200 bytes.
- **No WASM build**: Removed from `wxt.config.ts`. No Rust/wasm-pack toolchain needed.
- **No Offscreen Document changes**: The existing Offscreen Document is preserved for WebRTC only. No `SharedArrayBuffer` or `COOP/COEP` headers.
- **Android**: `AttestationVerifier.java` — ECDSA P-256 signature verification using the same `TrustedRpSigningKey` public keys. Validates before WebAuthn challenge recomputation.
- **Performance**: Attestation adds <20ms latency — synchronous with page load, no additional network round trips.
- **Bundle size**: ~200 bytes vs ~2MB for the prior WASM approach.

## V6 Alignment

PHASE 2 — Core V6 capability. This is the Layer 1 defense that mathematically eliminates RAT/DOM manipulation attacks. No longer blocked on TLSNotary licensing or WASM compilation feasibility. Can be implemented and tested independently; transport layer (usb-aoa-transport-proxy) needed only for Android-side verification.

## Dependencies

- Requires: Banks add `SmartID-Attestation` response header to their Smart-ID login endpoints (trivial — one line of server configuration)
- Blocking: `challenge-bound-webauthn` (needs the attested control code as challenge input)
- Related: `usb-aoa-transport-proxy` (transport for proof delivery to Android)
- Not blocked on: TLSNotary licensing, WASM compilation, Notary server deployment, SharedArrayBuffer availability
