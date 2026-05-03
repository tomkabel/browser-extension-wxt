# Wire Command Client Response Handler into Message Pipeline

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

`lib/channel/commandClient.ts:103-117` defines `handleIncomingResponse()` which decodes raw `ControlResponse` messages and resolves/rejects pending commands. However, this function is never called anywhere in the codebase. The `verify-transaction` handler in `messageHandlers.ts:855-883` unconditionally returns `{ verdict: 'confirmed' }` after a shallow storage check, bypassing phone-side verification entirely.

### Solution

1. In `entrypoints/offscreen-webrtc/main.ts`, after the data channel `onmessage` fires, route the received string through the command client's response handler before passing to the existing callback.
2. In `messageHandlers.ts`, replace the stub `verify-transaction` implementation with actual `commandClient.sendAuthenticateTransaction()` call.
3. Store the `CommandClient` instance in `storage.session` after pairing completes (currently only a boolean placeholder is stored).

### Acceptance Criteria

- `handleIncomingResponse` is reachable from the data-channel message path.
- A `verify-transaction` message triggers `sendAuthenticateTransaction()` on the command client.
- Pending commands resolve or reject based on actual phone responses, not synthetic data.
- Unit tests verify that an incoming `ControlResponse` with `status: 'confirmed'` resolves the pending promise.
