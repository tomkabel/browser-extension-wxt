## Why

`lib/webauthn/` contains challenge derivation and assertion request code for Challenge-Bound WebAuthn, but has 4 TypeScript type errors from TS 5.6 `BufferSource` incompatibility, is not imported by any entrypoint (dead code), and `messageHandlers.ts` has a latent runtime crash via a dynamic `import()` of a non-existent `transmitCredentialToAndroid` export. This blocks `tsc --noEmit` from passing and makes the entire Challenge-Bound WebAuthn flow unexecutable.

## What Changes

Fix 4 type errors in `challengeDerivation.ts` and `assertionRequest.ts` by casting `Uint8Array` to `BufferSource` compatibly with TS 5.6 strict DOM types. Wire `assertionRequest.ts` into `entrypoints/auth/main.ts` so the auth page uses the shared library instead of inline WebAuthn calls. Implement the missing `transmitCredentialToAndroid()` function in `pairingCoordinator.ts` or remove the dead handler and dynamic import. Add Zustand store fields for assertion state. Add unit tests for the assertion request lifecycle.

## Capabilities

### New Capabilities
- `challenge-derivation`: Canonical TLV serialization of zkTLS proof, origin, control code, and session nonce → SHA-256 hash for WebAuthn challenge binding
- `assertion-request`: `navigator.credentials.get()` wrapper with configurable challenge, timeout, and credential restriction; returns serialized assertion components

### Existing Capabilities Modified
- `pairing-coordinator`: Add `transmitCredentialToAndroid()` for passkey public key transmission over transport channel
- `auth-page`: Replace inline WebAuthn with library calls from `lib/webauthn/`
