## Why

WebAuthn PRF extension is Chrome-only. Firefox, Safari, and other browsers supported by WXT cannot perform silent re-authentication via PRF. The extension's session resume flow silently fails on non-Chrome browsers, forcing the user to re-pair on every browser restart. This blocks cross-browser support for a core UX feature.

## What Changes

Add a PRF-unavailable fallback path: when PRF is unavailable (detected via `checkPrfSupport()` returning false), session resume falls back to a phone-side approval flow. On browser restart without PRF, the extension sends a `resume-session` command over the existing transport channel. The phone displays a notification: "Resume session on Laptop?" with Approve/Deny. The user taps Approve → session resumes. This reuses the existing transport and command protocol — no new infrastructure needed.

## Capabilities

### New Capabilities
- `phone-approval-resume`: Session resume via phone notification approval when PRF is unavailable
- `cross-browser-prf-detection`: Platform-aware PRF support detection that routes to PRF or phone-approval path

### Existing Capabilities Modified
- `session-manager`: Add PRF-unavailable path in `performSilentReauth()`; send `resume-session` command when PRF absent
- `command-client`: Add `sendResumeSession()` command type
- `popup-auth-panel`: Show "Approving on phone..." status during phone-approval resume
