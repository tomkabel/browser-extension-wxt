## Why

Standard WebAuthn/FIDO2 prevents phishing by origin-binding, but it does NOT cryptographically bind the transaction context (control code, amount, beneficiary). A RAT that compromises the browser can:
1. Let the user authenticate the real transaction via WebAuthn
2. Mutate the DOM after authentication to show a fake result

V6 solves this with Challenge-Bound WebAuthn: the WebAuthn `challenge` parameter is a SHA-256 hash that includes the zkTLS proof, the transaction origin, the control code, and a session nonce. This means:
- The PC biometric (Windows Hello/TouchID) is cryptographically fused to the specific transaction
- Origin spoofing breaks the hash → Android Vault rejects the assertion
- The user's biometric is mathematically bound to "I approve this exact control code on this exact origin"

Without this binding, the WebAuthn assertion proves only that a human touched the sensor, not that they approved any particular transaction.

## What Changes

- **Challenge Derivation**: `Challenge = SHA-256(zkTLS_Proof || Origin || Control_Code || Session_Nonce)`. Implemented in the extension's background service worker.
- **WebAuthn Assertion with Custom Challenge**: Call `navigator.credentials.get({ publicKey: { challenge: derivedChallenge, rpId, ... } })`. The Host OS prompts with the computed challenge (user sees the transaction context via the OS biometric dialog where supported).
- **Challenge Recomposition on Android**: The Android Vault (Java Orchestrator) recomputes `SHA-256(zkTLS_Proof || Origin || Code || Nonce)` after verifying the zkTLS proof. It compares this with the challenge in the WebAuthn assertion.
- **Passkey Provisioning**: During Phase 0 pairing, the extension creates a Passkey bound to `chrome-extension://<id>`. The public key is stored in the Android trust-store.
- **Assertion Verification**: Android Vault verifies the WebAuthn assertion signature against the stored Passkey public key, using the recomputed challenge.

## Capabilities

### New Capabilities

- `challenge-derivation`: `SHA-256(zkProof || origin || code || nonce)` challenge computation with canonical serialization to prevent hash length extension or ambiguity attacks
- `webauthn-assertion-binding`: Invocation of `navigator.credentials.get()` with the derived challenge; extraction of authenticator data, signature, and client data JSON
- `challenge-recomputation-engine`: Android-side recomputation of the challenge after zkTLS verification, with strict comparison against the assertion's `response.clientDataJSON.challenge`
- `passkey-provisioning`: Phase 0 WebAuthn credential creation bound to the extension origin; public key storage in Android trust-store

### Modified Capabilities

- Existing `webauthn-auth-page` and `webauthn-prf-derivation` specs: PRF-based silent re-auth becomes a secondary mechanism (for session resumption only). Primary auth uses challenge-bound WebAuthn.
- `qr-sas-pairing`: Phase 0 pairing is extended with WebAuthn passkey creation as a cryptographic anchor.

## Impact

- **Browser extension**: `lib/webauthn/` — `challengeDerivation.ts`, `assertionRequest.ts`, `passkeyProvisioning.ts`. Offscreen document or popup for the WebAuthn invocation.
- **Offscreen Document**: WebAuthn API must be invoked from a user-visible context or the offscreen document (MV3 restriction). The popup is the primary invocation context.
- **Android**: `ChallengeVerifier.java` — recomputes the challenge hash. `WebAuthnVerifier.java` — verifies assertion signature using stored public key.
- **Phase 0 pairing flow**: Extension creates a passkey during pairing; public key bytes transmitted over AOA tunnel to Android for storage in the trust-store.
- **UI**: Popup shows the transaction context (origin, control code) before the biometric prompt, so the user knows what they're approving.

## V6 Alignment

PHASE 2 — Core V6 capability. Implements the cryptographic binding between network truth (zkTLS), human intent (biometric), and transaction context (control code). This is the mathematical foundation of V6's "Cryptographically Eliminated" threat posture for WebAuthn RP spoofing.

## Dependencies

- Blocked on: `zktls-context-engine` (needs the zkTLS proof as challenge input)
- Builds on: `usb-aoa-transport-proxy` (completed — Go Native Messaging Host + AOA 2.0 available for Android-side verification; WebRTC fallback also available for local testing)
- Blocking: `ndk-enclave-pin-vault`, `ghost-actuator-gesture-injection`, `eidas-qes-hardware-gate` (all depend on the verified user intent from this layer)
- Related: `vault6-migration-strategy` for overall sequence
