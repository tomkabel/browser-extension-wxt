## 1. Add `resume-session` Command Type

- [ ] 1.1 Add `CommandType.ResumeSession = 'resume-session'` to `types/commands.ts`
- [ ] 1.2 Add `sendResumeSession()` method to `lib/channel/commandClient.ts` — sends `{ deviceName, timestamp }`, waits for `{ status: 'approved' | 'rejected' }`
- [ ] 1.3 Unit test: `sendResumeSession` sends correct command structure

## 2. Add PRF-Unavailable Fallback in Session Manager

- [ ] 2.1 In `entrypoints/background/sessionManager.ts`: modify `performSilentReauth()` to check `checkPrfSupport()` and route:
  - PRF available → existing PRF flow (unchanged)
  - PRF unavailable → `commandClient.sendResumeSession()` with 30s timeout
- [ ] 2.2 On `resume-session` approval: call `activateSession()` and return `true`
- [ ] 2.3 On `resume-session` reject or timeout: return `false`, show appropriate popup status
- [ ] 2.4 Unit test: PRF-unavailable path calls `sendResumeSession`
- [ ] 2.5 Unit test: phone approval triggers `activateSession`

## 3. Add Transport Reconnection for Session Resume

- [ ] 3.1 Before sending `resume-session`, check if active transport exists via `getTransportManager().getActiveTransport()`
- [ ] 3.2 If no active transport: attempt IK Noise handshake with last paired device's stored static key
- [ ] 3.3 If reconnection fails: return `false` (session resume impossible)

## 4. Update Popup Auth Panel

- [ ] 4.1 Update `AuthPanel.tsx`: detect PRF availability on mount via `checkPrfSupport()` message
- [ ] 4.2 Show status messages for phone-approval flow:
  - "Requesting phone approval..." during `resume-session` send
  - "Session active" on approval
  - "Phone rejected session resume" on rejection
  - "Phone approval timed out" on timeout
- [ ] 4.3 Add explanatory text when PRF is unsupported: "Your browser doesn't support silent re-authentication."

## 5. Final Verification

- [ ] 5.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 5.2 Manual QA: verify PRF flow unchanged on Chrome
- [ ] 5.3 Manual QA: verify phone-approval flow on Firefox (or PRF-disabled Chrome)
