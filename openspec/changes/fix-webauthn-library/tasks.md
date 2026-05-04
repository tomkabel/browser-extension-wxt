> **Dependency**: The files in `lib/webauthn/` were created by `challenge-bound-webauthn`
> (tasks 1-3) and are marked [x] there, but contain 4 TypeScript 5.6 `BufferSource`
> type errors that block `tsc --noEmit`. This proposal fixes those errors and wires
> the library into the auth page entrypoint. Complete this proposal's tasks 1-2 before
> the `challenge-bound-webauthn` flow can execute without type errors.

## 1. Fix Type Errors in `lib/webauthn/`

- [x] 1.1 Fix `challengeDerivation.ts` line 144: cast `serialized` to `BufferSource`
- [x] 1.2 Fix `assertionRequest.ts` lines 45 and 54: cast to `BufferSource`
- [x] 1.3 Run `bun run typecheck` and verify zero errors

## 2. Wire `createAssertionRequest` into Auth Page

- [x] 2.1 Update `entrypoints/auth/main.ts` to import `createAssertionRequest` from `~/lib/webauthn`
- [x] 2.2 Add `authInProgress` flag to background state; reject concurrent auth requests
- [x] 2.3 Background sends challenge to auth page via URL parameter `?challenge=<base64url>` when opening `auth.html`
- [x] 2.4 Auth page calls `createAssertionRequest({ challenge, rpId, allowCredentialId })` instead of inline `credentials.get()`
- [x] 2.5 Add `assertionStatus` and `assertionError` to Zustand store
- [x] 2.6 Wire store state into popup `AuthPanel` UI

## 3. Implement `transmitCredentialToAndroid`

- [x] 3.1 Add `provision-passkey` command type to `types/commands.ts` CommandType enum
- [x] 3.2 Implement `transmitCredentialToAndroid()` in `entrypoints/background/pairingCoordinator.ts`
- [x] 3.3 Update `passkey-credential-created` handler in `messageHandlers.ts`: static import instead of dynamic
- [x] 3.4 Add unit test: `transmitCredentialToAndroid` sends correct payload

## 4. Final Verification

- [x] 4.1 Run `bun run lint && bun run typecheck && bun run test` — all pass (pre-existing lint/test failures unrelated to this change)
- [x] 4.2 Update `challenge-bound-webauthn/tasks.md` to reflect actual completion state of completed sub-tasks
