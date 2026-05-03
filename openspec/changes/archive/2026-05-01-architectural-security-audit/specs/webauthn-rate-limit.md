# Add Rate Limiting to WebAuthn MFA Endpoints

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

The `mfa-assertion` handler in `messageHandlers.ts:831-853` unconditionally calls `activateSession()` for any properly formatted assertion payload. There is no rate limiting, no replay detection, and no credential binding validation. An attacker who compromises the extension's message channel (e.g., via another extension with `activeTab` permission, or via a compromised content script) can repeatedly call `mfa-assertion` to extend or create sessions.

Similarly, the auth page (`entrypoints/auth/main.ts`) allows unlimited registration and authentication attempts with no cooldown.

### Solution

1. Apply the existing `checkRateLimit()` from `rateLimiter.ts` (or a companion instance) to the `mfa-assertion` handler in the background.
2. Track the `credentialId` from each assertion and reject reuse of the exact same `credentialId + clientDataJSON + authenticatorData` tuple (replay protection).
3. Add a 3-attempt-per-minute cap on the auth page for both registration and authentication operations.
4. Clear the rate-limit entry on successful session activation.

### Acceptance Criteria

- More than 3 `mfa-assertion` calls per minute result in `{ success: false, error: 'Rate limited' }`.
- Replay of the same assertion data is rejected.
- Auth page displays a cooldown message after 3 failed attempts.
- Unit tests verify rate limiting behavior.
