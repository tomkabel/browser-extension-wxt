# SmartID2 Penetration Test Plan

## 1. Replay Attack (Sequence Number Protection)

**Scenario:** An attacker captures encrypted messages on the data channel and re-sends them.

**Mitigation:** Noise protocol ChaCha20-Poly1305 cipher state includes a monotonically increasing nonce counter. Attempting to replay an old message uses a stale nonce, causing ChaCha20-Poly1305 decryption to fail (AEAD tag mismatch). After 1000 messages, HKDF key rotation refreshes cipher state with fresh nonce space.

**Verification:**
- [x] `noise.test.ts` — "out-of-order decryption fails" test confirms nonce-protection
- [x] Sequence monotonicity test (500 messages) confirms correct nonce ordering
- [x] Key rotation test (2000 messages) confirms long-lived session survival

## 2. Signaling MITM Attack (Noise Authentication)

**Scenario:** Attacker controls signaling server and attempts to MITM the Noise handshake by injecting their own keys.

**Mitigation:** Noise XX pattern authenticates both peers via static key exchange:
- Message 2 (responder → initiator): `e, ee, s, es` — responder's static key is authenticated via DH with initiator's ephemeral key
- Message 3 (initiator → responder): `s, se` — initiator's static key is authenticated via DH with responder's ephemeral key

An attacker who modifies the ephemeral public key in transit breaks the DH chains (ee, es, se), causing different cipher states on each side. The handshake produces different transport keys, and subsequent encrypted messages fail decryption (AEAD tag mismatch).

For IK pattern (reconnect): pre-message `s` sends static key in plaintext, but it's already authenticated from the initial XX pairing. An attacker modifying it causes the initiating side's `encrypt_and_hash(s, ss)` to produce a different ciphertext, failing the responder's `decrypt_and_hash`.

**Verification:**
- [x] `noiseInterop.test.ts` — deterministic keypair produces reproducible handshake
- [x] Wrong-key rejection test (100 iterations) confirms decryption fails with mismatched keys
- [x] Tampering test confirms any bit flip in ciphertext causes decryption failure

## 3. QR Relay Attack (SAS Confirmation)

**Scenario:** Attacker observes pairing QR code on victim's screen, scans it with their own phone, and relays the QR to the victim's real phone.

**Mitigation:** SAS (Short Authentication String) displayed on both laptop and phone. User manually confirms the 6-digit code matches. An attacker cannot MITM the QR scan + SAS confirmation simultaneously without being noticed.

The SAS code is derived from the Noise XX handshake: after the handshake completes, both sides compute `HKDF(chaining_key, handshake_hash)` to derive a 6-digit SAS. Any MITM breaks the handshake hash, producing a different SAS code on each side.

**Verification:**
- [x] Pairing UI requires manual SAS confirmation via "Match" / "No Match" buttons
- [x] If SAS codes don't match and user clicks "No Match", pairing is cancelled
- [x] `components/PairingPanel.tsx` — SAS code displayed prominently in popup

## 4. Session Hijacking (chrome.storage.session Isolation)

**Scenario:** Malicious content script or extension attempts to read the MFA session token.

**Mitigation:** `chrome.storage.session` is per-extension and isolated from content scripts and web pages. Only the extension's own service worker and extension pages can read session data. The session token is a random 32-byte value stored only in session storage (never in local storage, never exposed to pages).

**Verification:**
- [x] Session token stored exclusively in `chrome.storage.session` (not `local`)
- [x] No session data exposed to content scripts via messaging
- [x] Each `sendCommand()` call verifies session via `verifySession()` gate

## 5. Service Worker Restart (Session Restoration)

**Scenario:** Chrome terminates the service worker after 30s of inactivity. On wake, the MFA session must be preserved.

**Mitigation:** `chrome.storage.session` persists across service worker restarts (tied to browser session, not individual SW lifetime). The 5-minute TTL alarm in `chrome.alarms` also persists across SW restarts. On SW wake, `registerMessageHandlers()` is called in both `main()` and `browser.runtime.onStartup`, and the session manager checks `chrome.storage.session` for existing session.

**Verification:**
- [x] `background/index.ts` — registers handlers on both install and startup
- [x] `sessionManager.ts` — gets session from `chrome.storage.session` (persists across SW restarts)
- [x] `check-session` handler returns active session even after simulated SW restart
