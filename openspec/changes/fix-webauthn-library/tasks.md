## 1. Fix Type Errors in `lib/webauthn/`

- [ ] 1.1 Fix `challengeDerivation.ts` line 144: cast `serialized` to `BufferSource` using `new Uint8Array(serialized.buffer, serialized.byteOffset, serialized.byteLength) as BufferSource`
- [ ] 1.2 Fix `assertionRequest.ts` lines 45 and 54: cast `options.challenge` and `options.allowCredentialId` to `BufferSource` using the same pattern
- [ ] 1.3 Run `bun run typecheck` and verify zero errors

## 2. Wire `createAssertionRequest` into Auth Page

- [ ] 2.1 Update `entrypoints/auth/main.ts` to import `createAssertionRequest` from `~/lib/webauthn`
- [ ] 2.2 Add `authInProgress` flag to background state; reject concurrent auth requests
- [ ] 2.3 Background sends challenge to auth page via URL parameter `?challenge=<base64url>` when opening `auth.html`
- [ ] 2.4 Auth page calls `createAssertionRequest({ challenge, rpId, allowCredentialId })` instead of inline `credentials.get()`
- [ ] 2.5 Add `assertionStatus` and `assertionError` to Zustand store
- [ ] 2.6 Wire store state into popup `AuthPanel` UI

## 3. Implement `transmitCredentialToAndroid`

- [ ] 3.1 Add `provision-passkey` command type to `types/commands.ts` CommandType enum
- [ ] 3.2 Implement `transmitCredentialToAndroid()` in `entrypoints/background/pairingCoordinator.ts` — sends credential ID + public key bytes over active transport
- [ ] 3.3 Update `passkey-credential-created` handler in `messageHandlers.ts`: remove dynamic import, call `transmitCredentialToAndroid` directly
- [ ] 3.4 Add unit test: `transmitCredentialToAndroid` sends correct payload

## 4. Final Verification

- [ ] 4.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 4.2 Update `challenge-bound-webauthn/tasks.md` to reflect actual completion state of completed sub-tasks
