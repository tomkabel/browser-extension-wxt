## MODIFIED Requirements

### Requirement: use-lib-webauthn-for-assertion
- The `entrypoints/auth/main.ts` entrypoint SHALL import `createAssertionRequest` from `~/lib/webauthn` instead of calling `navigator.credentials.get()` inline
- The challenge SHALL be received from the background via URL parameter `?challenge=<base64url>`
- The `rpId` SHALL be derived from `chrome.runtime.getURL('/')`

### Requirement: auth-in-progress-guard
- The background SHALL maintain an `authInProgress` boolean flag
- **WHEN** an auth request is already in progress
- **THEN** new auth requests SHALL be rejected with `{ success: false, error: 'Authentication already in progress' }`
- **WHEN** the auth tab is closed or the assertion completes
- **THEN** the flag SHALL be cleared

### Requirement: assertion-state-in-store
- Zustand store SHALL have `assertionStatus: 'idle' | 'requesting' | 'success' | 'error'`
- Zustand store SHALL have `assertionError: string | null`
- The popup AuthPanel SHALL read these states to show appropriate UI
