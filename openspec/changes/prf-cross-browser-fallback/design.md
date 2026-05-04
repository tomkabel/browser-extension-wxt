## Context

`checkPrfSupport()` in `lib/crypto/fallbackAuth.ts` detects whether the WebAuthn PRF extension is available (Chrome-only). When unavailable, `performSilentReauth()` fails silently, leaving the user in an unauthenticated state on browser restart. The session resume UX is broken on Firefox, Safari, and any non-Chrome browser.

## Goals / Non-Goals

**Goals:**
- Detect PRF unavailability during session restore
- Fall back to phone-side approval for session resume
- Phone shows notification: "Resume session on Laptop?" with Approve/Deny
- Reuse existing transport channel and command protocol
- Update popup to show "Approving on phone..." during phone-approval resume

**Non-Goals:**
- Polyfilling PRF (impossible — requires browser-level WebAuthn extension support)
- Removing PRF fast path (it remains the primary path on Chrome)
- Implementing phone-side notification UI (covered by Android companion app)

## Decisions

### Decision 1: PRF detection routing

```typescript
async function performSilentReauth(): Promise<boolean> {
  const prfAvailable = await checkPrfSupport();

  if (prfAvailable) {
    return prfReauth();  // Existing PRF flow — Chrome only
  }

  // PRF unavailable — phone approval fallback
  const transport = getTransportManager()?.getActiveTransport();
  if (!transport) {
    return false;  // No active transport, can't reach phone
  }

  const commandClient = getCommandClient();
  if (!commandClient) {
    return false;
  }

  try {
    const response = await withTimeout(
      commandClient.sendResumeSession(),
      30_000,  // 30s timeout for user to tap phone
      'Phone approval timed out',
    );
    return response.status === 'approved';
  } catch {
    return false;
  }
}
```

### Decision 2: New `resume-session` command type

Add to `types/commands.ts`:
```typescript
CommandType.ResumeSession = 'resume-session'
```

The command payload is minimal:
```typescript
{ type: 'resume-session', deviceName: string, timestamp: number }
```

The phone receives this, shows a notification, and sends back:
```typescript
{ status: 'approved' | 'rejected' }
```

This reuses the existing command client infrastructure — ACK/retry, sequence numbering, key rotation, and encryption all apply.

### Decision 3: Popup UX for phone-approval resume

The AuthPanel checks `prfAvailable` on mount. If PRF is available, it shows the existing "Authenticate" button (open auth tab for WebAuthn). If PRF is unavailable, it shows:
- "Checking session..." → "Requesting phone approval..." → "Approved! Session active." or "Approval timed out."

No user interaction beyond opening the popup is required. The phone notification is the only user interaction step.

## Risks / Trade-offs

- [Risk] Phone may not have an active transport when session resume is attempted — This happens if the browser was closed for a long time and the WebRTC connection timed out. Mitigation: attempt transport reconnection first (use IK handshake with stored static keys), then send resume-session.
- [Risk] Phone notification may not arrive if the companion app is not running — Android can wake the app via FCM push. The signaling server can relay a wake-up push.
- [Risk] 30s timeout is too short for a user to find their phone — Acceptable. If the user misses the notification, they can open the popup again to retry. The transport stays connected.
