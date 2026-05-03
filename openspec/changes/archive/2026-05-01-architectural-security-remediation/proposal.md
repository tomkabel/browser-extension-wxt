## Why

A comprehensive architectural and security audit revealed critical cryptographic failures, non-functional verification paths, committed secrets, and extensive dead code that undermine the extension's security guarantees and operational resilience. The Noise handshake identity binding is broken (remote key replaced with zeros), transaction verification returns synthetic confirmations without phone-side input, and the command channel response pipeline is never wired — three cascading failures that render the core security model inoperative. Additionally, 6 dead-code modules increase attack surface and maintenance burden.

## What Changes

- Repair Noise XX handshake to extract correct remote static public key from the Handshake object
- Wire command client response handler into the data channel message pipeline
- Replace stub `verify-transaction` with actual phone-side command execution
- Remove committed secrets (`smartid2-key.pem`, `mydatabase.db`, `a11y-bridge.apk`) and rotate key material
- Delete dead-code modules: duplicate signaling server, unused popup panels, unreferenced intercept script, orphaned pairing coordinator
- Add React Error Boundary to popup for crash resilience
- Add cross-service-worker session persistence using `storage.local` mirror
- Harden CSP with `frame-ancestors 'none'` to prevent auth page clickjacking
- Fix rate limiter window double-count bug
- Add build-time environment variable validation for API/signaling endpoint configuration
- Add rate limiting and replay protection to WebAuthn MFA endpoints
- Rewrite E2E tests to verify extension behavior instead of page DOM

## Capabilities

### New Capabilities

- `rate-limiting-mfa`: Rate limiting and replay protection for WebAuthn `mfa-assertion` handler and auth page
- `env-config-validation`: Build-time validation of required environment variables (`VITE_API_ENDPOINT`, `VITE_SIGNALING_URL`)
- `error-boundary-popup`: React Error Boundary with recovery UI for popup crashes
- `session-persistence`: Cross-service-worker MFA session persistence via `storage.local` mirroring
- `csp-hardening`: Harden Content Security Policy with `frame-ancestors 'none'`
- `e2e-extension-tests`: E2E tests that load the extension and verify extension-specific behavior
- `dead-code-removal`: Remove 6 dead-code modules and 3 unused popup panels

### Modified Capabilities

- `noise-handshake`: **BREAKING** — Remote static key extraction must be corrected; all existing paired sessions are cryptographically invalid and must re-pair
- `extension-messaging`: `verify-transaction` handler signature and semantics change from stub to real command-client dispatch
- `transaction-flow`: Command client `handleIncomingResponse()` must be wired into data channel message pipeline; response handling is non-functional

## Impact

- **Critical security fix**: All existing paired sessions have zero-strength identity binding — users must re-pair after fix
- **Transaction flow**: Popup `TransactionPanel` now communicates with phone for real verification instead of instant confirmations
- **Build process**: Requires `VITE_API_ENDPOINT` and `VITE_SIGNALING_URL` environment variables; build fails fast if absent
- **Removed files**: 10+ source files removed — verify no imports reference them
- **Config changes**: CSP update requires re-review for production deployment
- **Git history**: Secret removal requires force-push coordination or squashing before merge to main
