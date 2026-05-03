## Why

V6's core security innovation is Zero-Knowledge Context Attestation (zkTLS). Current browser extensions have no way to prove what the server actually transmitted — they trust the DOM, which a RAT can manipulate arbitrarily. zkTLS using TLSNotary/DECO allows the extension to generate a cryptographic proof that a specific TLS server (identified by its certificate) transmitted a specific string (the control code) to the client. A local RAT cannot forge this because it lacks the bank's private TLS key. This is the foundation of V6's "Mathematically Eliminated" threat posture for RAT-based attacks.

Without zkTLS, the extension is blind to network truth — it sees only what the compromised OS/browser DOM tells it. V6 demands mathematical certainty, not heuristic trust.

## What Changes

- **TLSNotary/DECO WASM Module**: Embed a lightweight MPC prover compiled to WebAssembly that runs in the extension's Offscreen Document. When the user navigates to a whitelisted RP, the prover observes the TLS 1.3 handshake and transcript, generating a zero-knowledge proof that a specific string (the control code) appeared in the server's response.
- **Control Code Extraction Pipeline**: Post-zkTLS, extract the verified control code from the attested TLS transcript. Cross-reference with DOM-scraped code for defense-in-depth.
- **ZKP Verification Key Embedding**: Embed the bank/RP's TLS certificate public key in the extension package. The zkTLS proof is verified against this key on the Android Vault (Java layer).
- **Session Nonce Generation**: CSPRNG nonce generated per-session, bound into the zkTLS proof to prevent replay attacks.
- **Proof Serialization**: Compact binary serialization of the zkTLS proof (target <4KB) for efficient USB/WebRTC transport.

## Capabilities

### New Capabilities

- `tlsnotary-wasm-prover`: WASM-compiled TLSNotary MPC prover that runs in the Offscreen Document, observes TLS 1.3 handshake, generates ZKP of transcript inclusion
- `control-code-verification`: Pipeline that extracts the attested control code from the zkTLS proof and cross-references with DOM-scraped code
- `zkp-key-management`: Embedding and rotation of RP TLS certificate public keys for ZKP verification
- `zkp-serialization`: Compact binary proof format for efficient transport over USB/WebRTC

### Modified Capabilities

- Existing `domain-parser` and `content-script-detector` gain a new attestation layer — they now request zkTLS verification alongside DOM scraping
- `offscreen-document-lifecycle` must keep the WASM runtime alive during active sessions

## Impact

- **Browser extension**: `entrypoints/offscreen/` — new `zktls-prover.ts` that loads WASM, manages the TLSNotary session, and generates proofs. `lib/zktls/` directory with WASM binary, prover API, serialization
- **WASM compilation**: TLSNotary C/Rust code compiled to WASM via Emscripten/wasm-pack. Added to build pipeline in `wxt.config.ts`
- **Android**: `ZkProofVerifier.java` — verify zkTLS proof against embedded bank certificate. Called before WebAuthn challenge recomputation
- **Performance**: zkTLS proof generation is computationally intensive (~100-500ms). This runs in the Offscreen Document to avoid blocking the service worker
- **Bundle size**: WASM module is ~1-2MB. Must be loaded lazily only when a whitelisted RP is detected

## V6 Alignment

PHASE 2 — Core V6 capability. This is the Layer 1 defense that mathematically eliminates RAT/DOM manipulation attacks. Cannot be implemented before the transport layer (usb-aoa-transport-proxy) is available for Android-side proof verification, but the WASM prover can be built and tested independently.

## Dependencies

- Blocked on: TLSNotary licensing and audit (ensure WASM compilation is permissible)
- Blocking: `challenge-bound-webauthn` (needs the zkTLS proof as challenge input)
- Related: `usb-aoa-transport-proxy` (transport for proof delivery to Android)
