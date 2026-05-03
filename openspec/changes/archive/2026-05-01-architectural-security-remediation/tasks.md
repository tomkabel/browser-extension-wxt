## 1. Cryptographic Fixes

- [x] 1.1 Repair `performXXHandshake()` in `pairingCoordinator.ts`: replace `remoteStaticPk = new Uint8Array(32)` with `handshake.remoteStaticPublicKey` after reading message 2
- [x] 1.2 Fix `waitForDataChannelMessage()` listener leak: convert anonymous listener to named function, call `browser.runtime.onMessage.removeListener()` on promise resolve or timeout
- [x] 1.3 Remove dead `originalHandler`/`wrappedHandler` delegation from `waitForDataChannelMessage()`

## 2. Command Channel Wiring

- [x] 2.1 Wire `commandClient.handleIncomingResponse()` after Noise decryption in `pairingCoordinator.ts`
- [x] 2.2 Replace stub `verify-transaction` with real `commandClient.sendAuthenticateTransaction()` call in `messageHandlers.ts`
- [x] 2.3 Store `cmd:commandClient` flag in `storage.session` after pairing
- [x] 2.4 Instantiate `createCommandClient` with encrypted send provider in `pairingCoordinator.ts`

## 3. Remove Committed Secrets (Requires Manual Git Ops)

- [x] 3.1 `git rm --cached mydatabase.db`, removed secret files from disk, updated `.gitignore`
- [x] 3.2 Generated new RSA 2048-bit signing key, replaced in `wxt.config.ts:key`

## 4. Dead Code Removal

- [x] 4.1 Delete `signaling-server/server.mjs`
- [x] 4.2 Delete `ContentPanel.tsx` + test
- [x] 4.3 Delete `DomainPanel.tsx` + test
- [x] 4.4 Delete `ApiPanel.tsx` + test
- [x] 4.5 Delete `entrypoints/webauthn-intercept.content/`
- [x] 4.6 Verify via `bun run typecheck && bun run test` — 0 type errors, 98/98 tests pass

## 5. Error Boundary

- [x] 5.1 Create `entrypoints/popup/ErrorBoundary.tsx`
- [x] 5.2 Wrap `PanelRouter` with `ErrorBoundary` in `App.tsx`

## 6. Session Persistence

- [x] 6.1 Mirror `mfa:session` to `storage.local` in `sessionManager.ts`
- [x] 6.2 Restore persisted session on `onStartup`/`onInstalled`
- [x] 6.3 Update `clearSession()` to remove from both stores

## 7. CSP Hardening

- [x] 7.1 Add `frame-ancestors 'none'` to CSP
- [x] 7.2 Dynamic `connect-src` from `VITE_SIGNALING_URL`

## 8. Rate Limiter Bug Fix

- [x] 8.1 Verified — `return RateLimitResult.Allowed` was already present (audit false positive)
- [x] 8.2 All rate limiter tests pass

## 9. Environment Variable Validation

- [x] 9.1 Create `.env.example`
- [x] 9.2 Add prebuild validation to `package.json`
- [x] 9.3 Update `apiRelay.ts` to use `VITE_API_ENDPOINT`
- [x] 9.4 Update `wxt.config.ts` CSP to use `VITE_SIGNALING_URL`

## 10. WebAuthn MFA Rate Limiting

- [x] 10.1 Background rate limiter for `mfa-assertion` (3/60s)
- [x] 10.2 Replay protection with 5-minute dedup window
- [x] 10.3 Auth page attempt cooldown after 3 failures

## 11. E2E Test Rewrite (Requires Manual Updates)

- [x] 11.1 Rewrite `e2e/content-script-flow.spec.ts` — verifies content script messages and popup accessibility
- [x] 11.2 Rewrite `e2e/popup.spec.ts` — opens `chrome-extension://<id>/popup.html`, verifies render
- [x] 11.3 Rewrite `e2e/integration-flow.spec.ts` — removes try/catch skips, verifies auth page
- [x] 11.4 Rewrite `e2e/navigation-and-survival.spec.ts` — verifies tab switching, reload, SPA detection

## 12. Cleanup & Verification

- [x] 12.1 Update `.prettierignore`
- [x] 12.2 Remove dead CSS ref from `fix-manifest.js`
- [x] 12.3 Full CI check: typecheck ✅ | test ✅ 98/98 | build ✅ with dev env vars
