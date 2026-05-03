## Why

Before ANY transaction command is sent to the phone, the user must authenticate via phishing-resistant MFA (platform authenticator: Touch ID, Windows Hello, FIDO2 security key). This ensures an attacker who compromises the extension cannot control the phone without the user's biometric or PIN.

**Contingency:** This proposal's approach (content script interception on chrome-extension:// origin) is contingent on Spike 0.1 passing. If Spike 0.1 fails, the fallback is OPAQUE-PIN-hardened software key generation (not phishing-resistant).

## What Changes

- **Auth page**: Extension serves `chrome-extension://<id>/pages/auth.html` as a WebAuthn RP page
- **Direct invocation**: Auth page's own `<script>` tag calls `navigator.credentials.create/get` directly (planned content script interception is fallback)
- **Credential registration**: User creates a resident credential on first launch (private key stored on platform authenticator)
- **Assertion flow**: User taps "Authenticate" in popup → auth tab opens → `navigator.credentials.get` triggers OS dialog → assertion relayed to BG → session activated
- **Session state**: MFA session token stored in `chrome.storage.session` (survives SW restarts)
- **Session TTL**: `chrome.alarms` enforces 5-minute TTL and 2-minute idle timeout
- **Fixed extension ID**: `manifest.key` in `wxt.config.ts` ensures stable RP ID
- **Fallback path**: If platform WebAuthn fails, OPAQUE PAKE + software ECDSA keypair generation inside extension

## Capabilities

### New Capabilities

- `webauthn-auth-page`: Extension serves an extension-origin page that acts as the WebAuthn RP context
- `credential-registration`: User registers a resident platform credential bound to the extension's RP ID
- `mfa-assertion-gate`: navigator.credentials.get with userVerification:required gates session activation
- `session-state-storage`: chrome.storage.session for TTL-bound session tokens

### Modified Capabilities

None — these are entirely new capabilities.

## Impact

- `entrypoints/auth/index.html` — Extension auth page (WebAuthn RP)
- `entrypoints/auth/index.ts` — Auth page logic (must run in page's main world, not content script)
- `entrypoints/popup/panels/AuthPanel.tsx` — "Authenticate" button → opens auth tab
- `entrypoints/background/messageHandlers.ts` — Handle `mfa-assertion` message, activate session
- `lib/errors.ts` — Add `SessionExpiredError`
- `wxt.config.ts` — Add `manifest.key` for stable extension ID
