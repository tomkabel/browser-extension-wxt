## Context

The extension implements a 3-factor transaction verification pipeline: (1) DOM-based transaction detection, (2) Noise-encrypted WebRTC data channel to phone, (3) WebAuthn MFA session gating. An audit revealed that the cryptographic identity binding in step 2 is broken (remote key discarded), the phone verification in step 2/3 is simulated (stub `verify-transaction`), and the command response pipeline was never wired. The codebase also contains 6 dead-code modules, committed secrets, and missing operational hardening.

Authored from `openspec/changes/architectural-security-remediation/proposal.md`.

## Goals / Non-Goals

**Goals:**
- Restore Noise XX handshake identity binding by correctly extracting the remote static public key
- Wire the command client response handler so `verify-transaction` dispatches calls to the phone and processes real responses
- Remove all committed secrets (`.pem`, `.db`, `.apk`) and rotate key material
- Delete 6 dead-code modules (duplicate server, 3 unused panels, unused intercept, orphaned coordinator)
- Add React Error Boundary for popup crash resilience
- Add cross-SW session persistence via `storage.local` mirroring
- Add `frame-ancestors 'none'` CSP directive
- Add rate limiting and replay protection to WebAuthn MFA endpoints
- Fix rate limiter double-count bug
- Add build-time environment variable validation
- Rewrite E2E tests to load extension and verify extension behavior

**Non-Goals:**
- Redesign of the Noise protocol or cipher suite (remains X25519+ChaChaPoly+Blake2s)
- Re-architecture of the signaling server protocol
- Addition of new content script detectors beyond the existing LHV detector
- Migration from MV3 or addition of Firefox support

## Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Use `Handshake.getRemoteStaticPublicKey()` (or equiv) to extract key | Follows `salty-crypto` library API; eliminates manual framing errors | Manual `s` token parsing from handshake buffers (brittle, library version-dependent) |
| Wire `handleIncomingResponse` in offscreen document `onmessage` | Single funnel point for all data channel traffic; avoids duplicating dispatch logic | Wiring in `pairingService` (dead code — that module is being removed) |
| Mirror session to `storage.local` instead of `storage.session` alone | `storage.session` is volatile under MV3 SW termination; `storage.local` persists | IndexedDB (heavier, cross-context issues), `storage.sync` (quota-limited, 100KB) |
| Use env vars with Vite's `import.meta.env` for URLs | Vite natively supports env vars; existing pattern in offscreen-webrtc already uses `VITE_SIGNALING_URL` | JSON config file (requires runtime fetch), hardcoded values (current bug) |
| Delete (not refactor) dead-code modules | Files are unreferenced, implementing no functionality; keeping them increases maintenance burden | Refactoring into test utilities (no consumers exist) |
| Single Error Boundary wrapping PanelRouter | Panels share a common container; boundary at router level catches panel crashes while preserving header/footer | Per-panel boundaries (over-engineered for current component count) |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **BREAKING**: All existing paired sessions have zero-strength identity binding; users must re-pair after fix | Document in release notes; the cryptographic guarantee was already absent |
| `storage.local` write could fail silently under quota pressure | Add `try/catch` with fallback to `storage.session` only; log warning |
| E2E tests may become flaky with extension-loaded context (longer startup, popup lifecycle races) | Use `waitForLoadState` and explicit timeouts; CI retries (2) already configured |
| Env var validation adds build friction for new contributors | `.env.example` + clear error messages + dev default in `wxt.config.ts` as last resort |
- Dead-code deletion may miss transitive imports (e.g., `index.ts` barrel exports)
| Verify with `bun run build` and `bun run typecheck` after each removal |
