# Implementation Tasks

| Task ID | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| T-001 | Repair `performXXHandshake()` in `pairingCoordinator.ts`: extract `remoteStaticPk` from `Handshake` object using library accessor instead of zero-fill | Critical | Small |
| T-002 | Fix `waitForDataChannelMessage()` listener leak: use named function, call `removeListener` on promise settle | Critical | Small |
| T-003 | Wire `commandClient.handleIncomingResponse()` into `offscreen-webrtc/main.ts` data channel `onmessage` | Critical | Small |
| T-004 | Replace stub `verify-transaction` handler in `messageHandlers.ts` with actual `commandClient.sendAuthenticateTransaction()` call | Critical | Medium |
| T-005 | Store full `CommandClient` instance (not boolean placeholder) in `storage.session` after pairing | Critical | Small |
| T-006 | `git rm --cached` then `.gitignore` `*.pem`, `*.db`, `*.apk`, `*.key`, `credentials.*` | Critical | Small |
| T-007 | Rotate compromised extension signing key in `wxt.config.ts:key` | Critical | Small |
| T-008 | Add pre-push hook blocking secret-matching file patterns | High | Small |
| T-009 | Delete `signaling-server/server.mjs` (duplicate, unreferenced) | High | Small |
| T-010 | Delete `entrypoints/popup/panels/ContentPanel.tsx` and its test file | High | Small |
| T-011 | Delete `entrypoints/popup/panels/DomainPanel.tsx` and its test file | High | Small |
| T-012 | Delete `entrypoints/popup/panels/ApiPanel.tsx` and its test file | High | Small |
| T-013 | Delete `entrypoints/webauthn-intercept.content/index.ts` entire entrypoint directory | High | Small |
| T-014 | Delete `entrypoints/background/pairingCoordinator.ts` (all functions are dead) | High | Small |
| T-015 | Create `entrypoints/popup/ErrorBoundary.tsx` with `componentDidCatch` and reload fallback UI | High | Small |
| T-016 | Wrap `PanelRouter` in `App.tsx` with the new `ErrorBoundary` | High | Small |
| T-017 | Add session persistence: mirror `mfa:session` to `storage.local`, restore on background restart | High | Medium |
| T-018 | Update `clearSession()` to remove from both `storage.session` and `storage.local` | High | Small |
| T-019 | Add `frame-ancestors 'none'` to CSP in `wxt.config.ts` | High | Small |
| T-020 | Fix `rateLimiter.ts` window reset: add `return RateLimitResult.Allowed` after entry reset | Medium | Small |
| T-021 | Create `.env.example` file documenting `VITE_API_ENDPOINT` and `VITE_SIGNALING_URL` | Medium | Small |
| T-022 | Add prebuild env validation script that fails fast on missing required vars | Medium | Small |
| T-023 | Remove hardcoded `apiEndpoint` fallback in `apiRelay.ts`; use `import.meta.env.VITE_API_ENDPOINT` | Medium | Small |
| T-024 | Update `wxt.config.ts` CSP `connect-src` to use env-var-driven signaling URL | Medium | Small |
| T-025 | Rewrite `e2e/content-script-flow.spec.ts` to load extension and verify message round-trip | Medium | Large |
| T-026 | Rewrite `e2e/popup.spec.ts` to open `chrome-extension://<id>/popup.html` and verify panel rendering | Medium | Medium |
| T-027 | Rewrite `e2e/integration-flow.spec.ts` to remove try/catch skips and test real extension behavior | Medium | Medium |
| T-028 | Add background rate limiter instance for `mfa-assertion` handler (3/min) | Medium | Medium |
| T-029 | Add assertion replay protection tracking `credentialId + clientDataJSON + authenticatorData` tuple | Medium | Small |
| T-030 | Add cooldown UI to auth page after 3 failed WebAuthn attempts | Low | Small |
| T-031 | Unify signaling server codebase: confirm `server.js` is canonical, remove `server.mjs` references | Low | Small |
| T-032 | Update `.prettierignore` to exclude `*.pem`, `*.db`, `*.apk`, `*.key` | Low | Small |
| T-033 | Remove `fix-manifest.js` dead CSS reference (`assets/popup.css`) | Low | Small |
