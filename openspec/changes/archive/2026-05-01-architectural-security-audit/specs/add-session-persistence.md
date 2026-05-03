# Add Cross-Session Session Persistence Layer

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

`entrypoints/background/sessionManager.ts` stores MFA session data (`mfa:session`) exclusively in `browser.storage.session`, which is cleared when the Chrome service worker terminates. Under MV3, the service worker can be terminated after ~30 seconds of inactivity; when it restarts in response to a popup opening or a `tabs.onActivated` event, all session state is lost. The user must re-authenticate even if their session TTL (5 minutes) has not expired.

### Solution

1. Maintain the primary session in `browser.storage.session` for fast access, but also mirror to `browser.storage.local` with the same key.
2. On background startup (`runtime.onStartup` / `runtime.onInstalled`), check `storage.local` for a persisted session. If found and not expired, restore it to `storage.session`.
3. When a session expires or is cleared, remove from both storage areas.

### Acceptance Criteria

- A session activated then recovered after service-worker restart remains valid until its original expiry.
- `clearSession()` removes data from both `storage.session` and `storage.local`.
- No additional Chrome permission required (`storage` already granted).
- Unit tests verify across simulated restart cycles.
