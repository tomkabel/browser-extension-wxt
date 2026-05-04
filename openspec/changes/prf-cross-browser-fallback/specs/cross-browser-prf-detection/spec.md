## ADDED Requirements

### Requirement: platform-aware-prf-detection
`performSilentReauth()` in `entrypoints/background/sessionManager.ts` SHALL check `checkPrfSupport()` and route accordingly:
- PRF available → existing PRF silent re-auth flow
- PRF unavailable → phone approval fallback via `resume-session` command

### Requirement: popup-prf-status-display
The AuthPanel SHALL detect whether PRF is supported on the current browser. The "Authenticate" button SHALL show:
- PRF supported: no additional text
- PRF unsupported: additional text "Your browser doesn't support silent re-authentication. Session resume will require phone approval."

#### Scenario: chrome-uses-prf
- **WHEN** the browser is Chrome (PRF available)
- **THEN** session resume SHALL use the existing PRF flow

#### Scenario: firefox-uses-phone-approval
- **WHEN** the browser is Firefox (PRF unavailable)
- **THEN** session resume SHALL use the phone approval fallback
