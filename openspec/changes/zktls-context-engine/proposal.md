## Why

V6's core security innovation is cryptographic Context Attestation. Current browser extensions have no way to prove what the server actually transmitted — they trust the DOM, which a RAT can manipulate arbitrarily.

The original V6 design specified two approaches to solve this:
1. **TLSNotary WASM** (replaced due to: unresolved TLS witness architecture, AGPL licensing risk, Notary server requirement, ~2MB binary size)
2. **`SmartID-Attestation` signed HTTP header** (pure TypeScript, ~200 bytes, <20ms latency)

Both approaches have a fundamental limitation: they require bank-side cooperation. The signed header approach needs the bank to emit a `SmartID-Attestation` response header (one-line server config change), but adoption is slow.

**The breakthrough**: Browser-level security headers (`Sec-Fetch-*`) are set immutably by the browser's network stack. A RAT compromising the renderer process CANNOT forge `Sec-Fetch-Site: same-origin`. These headers prove that the browser itself navigated to the transaction page — not a malicious script. This requires zero infrastructure changes and works today.

V6 now implements a **three-tier progressive TLS binding proof system**:

| Tier | What | Deployment | Latency |
|---|---|---|---|
| **Tier 1** | Sec-Fetch-* header capture via `webRequest.onHeadersReceived` | Zero infra | <5ms |
| **Tier 2** | TLS Token Binding via WebTransport to `/.well-known/token-binding` | RP endpoint | <50ms |
| **Tier 3** | Signed `SmartID-Attestation` header + DECO WASM oracle | Bank + Notary | 1-2s |

Each tier is a strict superset of the previous. The challenge version byte (0x02) encodes which tier was used.

## What Changes

- **Tier 1: Sec-Fetch Header Capture**: Background service worker intercepts `main_frame` responses via `chrome.webRequest.onHeadersReceived`. Captures `Sec-Fetch-Site`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`. These are hashed into the WebAuthn challenge (version 0x02). No bank changes needed.
- **Tier 2: TLS Token Binding**: Offscreen document creates WebTransport connection to the RP's `/.well-known/token-binding` endpoint. Captures the TLS channel ID, proving the extension's TLS session is the same one serving the transaction page.
- **Tier 3: Signed Header + DECO**: The existing `SmartID-Attestation` header verification remains. Combined with a WASM-based DECO oracle in the offscreen document for MPC-verified TLS observation (deferred to Phase 3).
- **`SmartID-Attestation` Header Verification** (existing): The extension intercepts response headers from whitelisted RPs via `chrome.webRequest.onHeadersReceived`. Verifies ECDSA P-256 signatures using `crypto.subtle.verify()`. This is now Tier 3 of the progressive system.
- **`TrustedRpSigningKey` Manifest**: Bundles ECDSA P-256 public keys for each whitelisted RP domain. Supports multiple keys per domain for rotation overlap. Keys are dedicated signing keys (not TLS certificate keys).
- **Control Code Verification Pipeline**: Extracts the attested control code from the signed header or Sec-Fetch context, cross-references with DOM-scraped code. On mismatch, uses attested code (not DOM code) — maximum security.
- **Proof Transport**: The TLS binding proof, control code, signature, and key ID are sent to the Android Vault over existing USB/WebRTC transport. The Android Vault re-verifies the proof before using as WebAuthn challenge input.

## Capabilities

### New Capabilities

- `sec-fetch-binding`: (Tier 1) Captures immutable browser-level `Sec-Fetch-*` headers via `webRequest.onHeadersReceived`. Zero-infra proof that the browser's network stack witnessed the navigation.
- `token-binding-proof`: (Tier 2) WebTransport-based TLS channel ID capture for transport-level binding.
- `signed-header-attestation`: (Tier 3, was `tlsnotary-wasm-prover`) Intercepts HTTP responses from whitelisted RPs, verifies ECDSA P-256 signed control code attestations in the `SmartID-Attestation` header
- `deco-wasm-oracle`: (Tier 3, deferred) WASM MPC oracle observing bank's HTTP response for mathematical proof
- `control-code-verification`: Pipeline that extracts the attested control code from the binding proof and cross-references with DOM-scraped code
- `zkp-key-management`: Embedding and rotation of RP ECDSA P-256 signing keys for attestation verification
- `tier-auto-negotiation`: Automatic selection of highest available tier, with graceful degradation

### Modified Capabilities

- Existing `domain-parser` and `content-script-detector` gain a new attestation layer — they now request TLS binding alongside DOM scraping
- `offscreen-document-lifecycle` — Required for Tier 2 (WebTransport) and Tier 3 (WASM oracle). Not required for Tier 1.
- `challenge-derivation` (from `challenge-bound-webauthn`) now accepts `TlsBindingProof` instead of `zkTLS_Proof`, with version byte 0x02 and tier discrimination

## Impact

- **Browser extension**: `lib/tlsBinding/` — new directory with `secFetchCapture.ts` (~50 lines), `tokenBinding.ts` (~100 lines), `decoOracle.ts` (~200 lines, deferred). Existing `lib/attestation/` preserved for Tier 3 signed-header verification. Total Tier 1 bundle impact: ~150 bytes.
- **No WASM module for Tier 1/2**: Only Tier 3 requires WASM. Removed from critical path.
- **Offscreen Document**: Used for Tier 2 (WebTransport) and Tier 3 (WASM oracle). Not needed for Tier 1.
- **Android**: `AttestationVerifier.java` — validates tier policy and binding proof per tier. Same ECDSA P-256 verification code path for Tier 3 signed headers.
- **Performance**: Tier 1 adds <5ms (synchronous header capture). Tier 2 adds <50ms (WebTransport round-trip). Tier 3 adds 1-2s (WASM oracle, cached per-session).
- **Bundle size**: Tier 1: ~150 bytes. Tier 2: ~500 bytes. Tier 3: ~2MB (loaded only when RP policy requires it).

## V6 Alignment

PHASE 2 — Core V6 capability. This is the Layer 1 defense that mathematically eliminates RAT/DOM manipulation attacks. The progressive tier system means Tier 1 is immediately deployable with zero infrastructure changes. Tier 2 and Tier 3 layer on additional guarantees as infrastructure matures.

## Demo Mode

Tier 1 Sec-Fetch capture works in any browser without configuration. For Tier 3 testing, the extension supports a **demo mode** (activated by `import.meta.env.DEV` or `MODE=demo`) where:

1. Real ECDSA P-256 key pairs are generated and bundled in `trusted-rp-keys.json`
2. A `demoAttestation.ts` utility creates locally-signed headers using the private key via Web Crypto API
3. The attestation manager auto-injects demo attestation headers for whitelisted domains in dev mode
4. All crypto operations are identical to production — the same `crypto.subtle.verify()` code path is exercised
5. End-to-end unit tests verify the entire pipeline: key generation → signing → parsing → verification → cross-reference

**⚠️ Security caveat:** Demo mode exercises the functional crypto pipeline (`crypto.subtle.verify()`, header parsing, control-code cross-reference) but does **NOT** replicate the production threat model. Demo private keys are bundled in source and can be extracted by any local attacker to forge attestation headers. Demo mode is for development and integration testing only. Production requires bank-held signing keys and server-signed `SmartID-Attestation` headers. When switching to production: replace `trusted-rp-keys.json` with bank-provided public keys, disable the demo injector via runtime guards, and enable manifest refresh from the update server.

## Dependencies

- Tier 1: Zero external dependencies. `chrome.webRequest.onHeadersReceived` available in all MV3 browsers.
- Tier 2: Requires RP to serve `/.well-known/token-binding` endpoint (standard draft).
- Tier 3: Requires bank `SmartID-Attestation` header (one-line server config). For demo: self-signed headers via `demoAttestation.ts`.
- Blocking: `challenge-bound-webauthn` (needs the TLS binding proof as challenge input)
- Related: `usb-aoa-transport-proxy` (transport for proof delivery to Android)
- Not blocked on: TLSNotary licensing, WASM compilation (Tier 3 deferred), Notary server deployment
