## 1. Auth Page

- [x] 1.1 Create `entrypoints/auth/index.html` with minimal full-page styling
- [x] 1.2 Add auth page script with direct `navigator.credentials.create()` call
- [x] 1.3 Add auth page script with direct `navigator.credentials.get()` call
- [x] 1.4 Register credential on first launch (guide user through creation)

## 2. Session State

- [x] 2.1 Implement `SessionState` interface with `sessionToken`, `mfaVerifiedAt`
- [x] 2.2 Store session in `chrome.storage.session` after successful MFA assertion
- [x] 2.3 Implement `chrome.alarms` for 5-minute session TTL
- [x] 2.4 Implement `chrome.alarms` for 2-minute idle timeout
- [x] 2.5 Add `sendCommand()` MFA gate check: reject if no session token

## 3. Fallback Path (if WebAuthn fails)

- [x] 3.1 Implement OPAQUE PIN hardening using key derivation
- [x] 3.2 Implement `crypto.subtle.generateKey()` ECDSA P-256 keypair generation
- [x] 3.3 Implement PIN-locked encrypted private key storage in chrome.storage.local
