## Context

`lib/webauthn/` was created as part of the `challenge-bound-webauthn` spec but two problems exist: (1) the files have 4 TypeScript 5.6 type errors where `Uint8Array.buffer` returns `ArrayBufferLike` (not `ArrayBuffer`) which is incompatible with `BufferSource` in strict DOM types, and (2) the module is not imported by any entrypoint — it's dead code. Additionally, `messageHandlers.ts:433` does a dynamic `import('./pairingCoordinator')` for `transmitCredentialToAndroid` which doesn't exist, causing a runtime crash.

## Goals / Non-Goals

**Goals:**
- Fix all 4 type errors so `tsc --noEmit` passes
- Wire `createAssertionRequest()` into `entrypoints/auth/main.ts` replacing inline WebAuthn calls
- Implement `transmitCredentialToAndroid()` in `pairingCoordinator.ts` or remove the dead handler
- Add `assertionStatus`, `assertionError` fields to Zustand store
- Add unit tests for assertion request lifecycle (timeout, cancellation, success)
- Update `challenge-bound-webauthn/tasks.md` to reflect actual completion state

**Non-Goals:**
- Implement the Android-side challenge verifier (covered by `android-companion-app`)
- Implement zkTLS proof generation (covered by existing attestation module)
- Full end-to-end challenge-bound transaction flow (requires Android companion)

## Decisions

### Decision 1: Type cast at call site, not config change

The type error is `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource`. Rather than relaxing TypeScript strictness or changing lib, cast at the call site:
```typescript
const hash = await crypto.subtle.digest(
  'SHA-256',
  new Uint8Array(serialized.buffer, serialized.byteOffset, serialized.byteLength) as BufferSource
);
```
This creates a properly-typed `Uint8Array<ArrayBuffer>` view (not copy) and casts it. The `byteOffset`/`byteLength` handling is correct for subarray views.

### Decision 2: Wire into auth page as the sole assertion path

Replace the inline `navigator.credentials.get()` in `entrypoints/auth/main.ts` with `createAssertionRequest()` from `lib/webauthn/`. The auth page receives the challenge via URL parameters (`?challenge=...`) set by the background when opening the auth tab. This eliminates duplicated WebAuthn logic and makes the challenge-derivation library the single source of truth.

### Decision 3: Implement `transmitCredentialToAndroid()`, don't remove

The handler is already wired in the message bus. Removing it would break the passkey provisioning flow. Implement the function by adding a new command type `provision-passkey` to CommandClient and sending the credential ID + public key bytes over the active transport.

## Risks / Trade-offs

- [Risk] Auth page receives challenge via URL — URL params are visible in tab history and extensions can read them. Mitigation: challenge is a non-secret (it's derived from public data and sent to phone anyway). The assertion secret is the biometric, not the challenge.
- [Risk] Auth page may be closed before assertion completes — Mitigation: `createAssertionRequest` handles timeout internally (60s). Background receives timeout error and shows "Verification timed out" in popup.
- [Risk] Multiple auth tabs opened simultaneously — Mitigation: track an `authInProgress` flag in the background state; reject new auth requests while one is active.
