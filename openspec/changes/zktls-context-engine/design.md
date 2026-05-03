## Context

The zkTLS Context Engine provides mathematical certainty about what a TLS server transmitted to the browser. It uses a lightweight Multi-Party Computation (MPC) protocol (TLSNotary or DECO) that allows the browser extension to generate a zero-knowledge proof that a specific string (the Smart-ID control code) appeared in the TLS-encrypted server response.

The proving operates as follows:
1. The extension's Offscreen Document hosts a WASM-compiled MPC prover
2. The prover observes the TLS 1.3 handshake between the browser and the RP server
3. During TLS notarization, the prover commits to specific parts of the TLS transcript
4. The prover generates a ZKP that proves: "The server holding TLS private key for domain X transmitted string Y in response Z"
5. This proof is compact (<4KB) and can be verified using only the server's TLS certificate public key

## Goals / Non-Goals

**Goals:**
- WASM-compiled TLSNotary/DECO prover running in the Offscreen Document
- ZKP generation for TLS 1.3 transcript inclusion (specific control code string)
- Proof size <4KB for efficient transport over USB or WebRTC
- Proof verification on Android using the bank/RP's TLS certificate
- Control code extraction from attested transcript
- Cross-reference with DOM-scraped code for defense-in-depth
- Support for whitelisted RP domains (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)

**Non-Goals:**
- TLS 1.2 support (all Smart-ID RPs use TLS 1.3)
- Proving arbitrary transcript content (only control code strings)
- Real-time proof generation for every page load (only during Smart-ID auth flow)
- Browser-independent operation (requires MV3 offscreen document API)

## Decisions

### 1. WASM Compilation Target

The TLSNotary MPC prover is written in Rust and compiled to WASM via `wasm-pack`. The WASM module:
- Size target: <2MB gzipped
- Lazy-loaded when a whitelisted RP domain is detected
- Cached in `chrome.storage.local` after first load
- Requires SharedArrayBuffer for MPC prover threads (need COOP/COEP headers via Offscreen Document)

### 2. ZKP Flow

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER EXTENSION (Offscreen Document)                      │
│                                                              │
│  1. User navigates to lhv.ee, initiates Smart-ID login       │
│  2. Extension detects control code "4892" in DOM             │
│  3. Offscreen Doc loads WASM prover                          │
│  4. Prover observes TLS 1.3 handshake (notarization)         │
│  5. Prover generates ZKP: "lhv.ee TLS cert attested '4892'" │
│  6. Proof serialized to <4KB binary                          │
│  7. Proof sent to Go Native Host → Android Vault             │
│                                                              │
│  ANDROID VAULT (Java Orchestrator)                           │
│                                                              │
│  8. ZkProofVerifier receives proof + bank TLS cert           │
│  9. Verifier checks: proof valid? cert matches RP?           │
│  10. Extracts attested control code: "4892"                  │
│  11. Passes to ChallengeVerifier for WebAuthn binding        │
└─────────────────────────────────────────────────────────────┘
```

### 3. TLSNotary Mechanics (Simplified)

TLSNotary works by splitting the TLS session into two parties:
- **Notary**: A third-party server that observes the TLS handshake and attests to the transcript
- **Prover**: The browser (our WASM module) that proves specific transcript excerpts

For privacy, the Notary never learns the transcript content — it only attests to its cryptographic integrity. The Prover generates a ZKP showing that a specific string exists within the attested transcript without revealing the rest of the transcript.

Implementation approach:
1. Establish a TLS 1.3 connection to the RP server
2. Split the TLS session key between Prover and Notary using MPC
3. Notary commits to the encrypted transcript
4. Prover generates a ZKP of inclusion for the control code substring
5. The resulting proof includes: TLS session fingerprint, transcript position, control code, Notary's attestation signature

### 4. RP Certificate Key Management

Bank/RP TLS certificates rotate periodically. The extension must maintain a current set of trusted public keys:

```typescript
interface TrustedRpKey {
  domain: string
  subjectPublicKey: Uint8Array  // DER-encoded SPKI
  notBefore: string             // ISO 8601
  notAfter: string              // ISO 8601
  fingerprint: string           // SHA-256 of DER certificate
}
```

Keys are updated via:
- Bundled with extension release (initial set)
- Background update check against a signed key manifest
- User can manually trigger an update in the popup

### 5. Performance Budget

| Operation | Budget | Target |
|---|---|---|
| WASM module load (cold) | <500ms | First load from storage |
| TLS handshake observation | <200ms | Transparent to user |
| ZKP generation | <1000ms | Offscreen Document, non-blocking |
| Proof serialization | <10ms | Into <4KB binary |
| Android verification | <50ms | On device CPU |
| Total latency add | <2s | Acceptable for auth flow |

## Risks / Trade-offs

- [Risk] TLSNotary requires a Notary server (third-party MPC participant) — Self-host a Notary instance or use TLSNotary's public infrastructure; latency impact on proof generation
- [Risk] WASM SharedArrayBuffer may be unavailable (cross-origin isolation) — Offscreen Document can set required headers via manifest CSP
- [Risk] TLS 1.3 session resumption (0-RTT) may skip full handshake — Force full handshake during zkTLS sessions or handle 0-RTT case separately
- [Risk] RP TLS certificate rotation breaks trust — Implement automatic key refresh from a signed manifest hosted alongside the extension update server
- [Risk] Proof generation increases login latency by ~1-2s — Show "Attesting transaction context..." in the popup; this is a one-time cost per session
- [Trade-off] DECO (more private, no Notary needed) vs TLSNotary (more mature, needs Notary) — Start with TLSNotary for faster implementation; DECO as a future optimization when WASM support matures
