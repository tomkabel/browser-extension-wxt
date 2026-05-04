## Why

Standard WebAuthn/FIDO2 prevents phishing by origin-binding, but it does NOT cryptographically bind the transaction context (control code, amount, beneficiary). A RAT that compromises the browser can:
1. Let the user authenticate the real transaction via WebAuthn
2. Mutate the DOM after authentication to show a fake result

V6 solves this with Challenge-Bound WebAuthn: the WebAuthn `challenge` parameter is a SHA-256 hash that includes a **TLS binding proof** (progressive three-tier), the transaction origin, the control code, and a session nonce. This means:
- The PC biometric (Windows Hello/TouchID) is cryptographically fused to the specific transaction
- Origin spoofing breaks the hash → Android Vault rejects the assertion
- The user's biometric is mathematically bound to "I approve this exact control code on this exact origin"

Without this binding, the WebAuthn assertion proves only that a human touched the sensor, not that they approved any particular transaction.

## Progressive Proof Hardening (Three-Tier System)

The original design specified "zkTLS proof" as a single monolithic component. After deep analysis, zkTLS was replaced with a three-tier progressive proof system because full zkTLS/DECO requires bank-side changes, WASM oracles, and third-party notary servers — none of which are feasible immediately.

The system auto-negotiates the strongest available tier at challenge time:

| Tier | Mechanism | Latency | Deployment | Security Level |
|---|---|---|---|---|
| **Tier 1** | Sec-Fetch-* HTTP header binding via `webRequest.onHeadersReceived` | <5ms | Now (no infra changes) | Browser-level: proves browser network stack witnessed the navigation |
| **Tier 2** | TLS Channel ID / Token Binding via WebTransport to `/.well-known/token-binding` | <50ms | 1 month (minimal infra) | Transport-level: binds extension TLS session to transaction page |
| **Tier 3** | Minimal DECO / TLSNotary WASM oracle in offscreen document | 1-2s | 3 months (WASM build + notary) | Cryptographic: MPC-verified TLS session with mathematical proof |

Each tier is a strict superset: Tier 2 includes Tier 1's binding, Tier 3 includes both. The Android Vault validates which tier was used from the challenge version byte and enforces minimum tier per RP policy.

## What Changes

- **TLS Binding Proof Derivation**: `TlsBindingProof = SecFetchHeaders || PageContentHash || (optional) TokenBinding || (optional) DECO_Proof`. Each tier adds more bytes. The background service worker captures `Sec-Fetch-Site`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode` headers via `webRequest.onHeadersReceived` — these are set by the browser and cannot be forged by renderer-level JS (RATs).
- **Challenge Derivation**: `Challenge = SHA-256(TlsBindingProof || Origin || Control_Code || Session_Nonce)`, version 0x02. Implemented in the extension's background service worker.
- **WebAuthn Assertion with Custom Challenge**: Call `navigator.credentials.get({ publicKey: { challenge: derivedChallenge, rpId, ... } })`. The Host OS prompts with the computed challenge (user sees the transaction context via the OS biometric dialog where supported).
- **Challenge Recomposition on Android**: The Android Vault recomputes `SHA-256(TlsBindingProof || Origin || Control_Code || Session_Nonce)` after verifying the proof. It compares this with the challenge in the WebAuthn assertion.
- **Passkey Provisioning**: During Phase 0 pairing, the extension creates a Passkey bound to `chrome-extension://<id>`. The public key is stored in the Android trust-store.
- **Assertion Verification**: Android Vault verifies the WebAuthn assertion signature against the stored Passkey public key, using the recomputed challenge.

## Capabilities

### New Capabilities

- `tls-binding-proof`: Progressive three-tier proof derivation — Tier 1 captures browser `Sec-Fetch-*` headers, Tier 2 adds TLS Token Binding via WebTransport, Tier 3 adds DECO WASM oracle. Auto-negotiated to strongest available tier.
- `challenge-derivation`: `SHA-256(tlsBindingProof || origin || code || nonce)` challenge computation with canonical TLV serialization (version 0x02)
- `webauthn-assertion-binding`: Invocation of `navigator.credentials.get()` with the derived challenge; extraction of authenticator data, signature, and client data JSON
- `challenge-recomposition-engine`: Android-side recomputation of the challenge after TLS binding verification, with strict comparison against the assertion's `response.clientDataJSON.challenge`
- `passkey-provisioning`: Phase 0 WebAuthn credential creation bound to the extension origin; public key storage in Android trust-store

### Modified Capabilities

- Existing `webauthn-auth-page` and `webauthn-prf-derivation` specs: PRF-based silent re-auth becomes a secondary mechanism (for session resumption only). Primary auth uses challenge-bound WebAuthn.
- `qr-sas-pairing`: Phase 0 pairing is extended with WebAuthn passkey creation as a cryptographic anchor. QR code now embeds the initiator SDP offer for server-less pairing via WebRTC Perfect Negotiation.

## Impact

- **Browser extension**: `lib/webauthn/` — `challengeDerivation.ts`, `assertionRequest.ts`, `passkeyProvisioning.ts`. Plus `lib/tlsBinding/` — `secFetchCapture.ts`, `tokenBinding.ts`, `decoOracle.ts`. Offscreen document or popup for the WebAuthn invocation.
- **TLS Binding Module**: New `lib/tlsBinding/` directory with three-tier proof derivation. Tier 1 uses `chrome.webRequest.onHeadersReceived` to capture immutable browser-level security headers. Tier 2 uses `WebTransport` to `/.well-known/token-binding`. Tier 3 uses a WASM oracle in the offscreen document (optional, deferred).
- **Offscreen Document**: WebAuthn API must be invoked from a user-visible context or the offscreen document (MV3 restriction). The popup is the primary invocation context.
- **Android**: `ChallengeVerifier.java` — recomputes the challenge hash. `WebAuthnVerifier.java` — verifies assertion signature using stored public key.
- **Phase 0 pairing flow**: Extension creates a passkey during pairing; public key bytes transmitted over the transport channel to Android for storage in the trust-store.
- **UI**: Popup shows the transaction context (origin, control code) before the biometric prompt, so the user knows what they're approving.

## V6 Alignment

PHASE 2 — Core V6 capability. Implements the cryptographic binding between network truth (zkTLS), human intent (biometric), and transaction context (control code). This is the mathematical foundation of V6's "Cryptographically Eliminated" threat posture for WebAuthn RP spoofing.

## Dependencies

- Builds on: `tls-binding-engine` (was `zktls-context-engine` — provides the Sec-Fetch-* header capture and progressive proof tiers as challenge input). Tier 1 has zero external dependencies. Tier 2 requires WebTransport endpoint on the RP. Tier 3 requires DECO WASM oracle.
- Builds on: `usb-aoa-transport-proxy` (completed — Go Native Messaging Host + AOA 2.0 available for Android-side verification; WebRTC fallback also available for local testing)
- Blocking: `ndk-enclave-pin-vault`, `ghost-actuator-gesture-injection`, `eidas-qes-hardware-gate` (all depend on the verified user intent from this layer)
- Related: `vault6-migration-strategy` for overall sequence
