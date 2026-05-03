# V6 Integration Flow

## Purpose

Define the end-to-end integration scenarios spanning the complete V6 chain: zkTLS attestation → challenge-bound WebAuthn → transport (USB AOA primary / WebRTC fallback) → Android verification → NDK enclave → Ghost Actuator → eIDAS QES gate. Each scenario traces a complete user journey across all V6 capabilities, verifying that the independent component implementations interact correctly as a coherent system.

This specification assumes all V6 components are integrated and operational. For migration sequencing, see `openspec/changes/vault6-migration-strategy/design.md`. For individual component specifications, see the respective OpenSpec change proposals.

---

## Overview

The V6 integration flow replaces the Phase 1 password-manager-style credential relay with a cryptographically hardened, enclave-backed Smart-ID automation pipeline. The browser extension never handles PIN digits. Instead, it proves network truth (zkTLS), binds human intent (challenge-bound WebAuthn), and delegates PIN decryption and gesture injection to an Android NDK enclave with hardware-gated QES execution.

**Key Properties:**
- **Zero PIN exposure**: PIN plaintext exists only in an `mlock`-ed C++ buffer inside the NDK enclave; the JVM, extension, transport, and IPC layers handle only anonymous coordinates.
- **Cryptographic transaction binding**: The WebAuthn challenge is a SHA-256 hash of the zkTLS proof, origin, control code, and nonce — the user's biometric is mathematically fused to the exact transaction.
- **Hardware-gated QES**: PIN2 (Qualified Electronic Signature) operations suspend in an `ARMED` state until the user physically presses Volume Down on the phone after viewing the transaction on the Smart-ID app screen.
- **Dual transport**: USB AOA 2.0 is primary; WebRTC with TURN relay is fallback. `TransportManager` auto-selects with seamless failover.
- **Degradation path**: Every stage has a defined fallback. The complete chain degrades to DOM-only manual PIN entry rather than failing hard.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BROWSER EXTENSION (WXT MV3)                          │
│  entrypoints/content/          entrypoints/background/                      │
│  ├─ content-script.ts          ├─ service-worker.ts                         │
│  │   Smart-ID button            │   ├─ webRequest listener                  │
│  │   detection (MutationObserver)│   ├─ zkTLS verifier (lib/zktls/)         │
│  │   lhv.ee / swedbank.ee       │   ├─ challenge derivation                 │
│  │   seb.ee / tara.ria.ee       │   │   (lib/webauthn/challengeDerivation)  │
│  │                               │   ├─ TransportManager                     │
│  │   detect-smartid-login        │   │   (lib/transport/manager.ts)           │
│  │   message ───────────────────►│   │   ├─ AoaTransport (primary)          │
│  │                               │   │   └─ WebRtcTransport (fallback)      │
│  │                               │   └─ offscreen lifecycle mgmt             │
│  │                               │       (background/offscreenWebrtc.ts)     │
│  │                               │                                           │
│  │   click event ───────────────►│   chrome.webRequest.onHeadersReceived     │
│  │                               │   intercepts SmartID-Attestation header   │
│  │                               │                                           │
│  │   DOM-scraped control code    │   ┌─ zkTLS verify (crypto.subtle.verify)  │
│  │   (cross-reference)           │   │  ECDSA P-256 over canonical JSON      │
│  │                               │   │  (lib/zktls/verifyAttestation.ts)     │
│  │                               │   ▼                                       │
│  │                               │   Challenge = SHA256(                     │
│  │                               │     attestation || origin || code || nonce)│
│  │                               │   (lib/webauthn/challengeDerivation.ts)   │
│  │                               │   ▼                                       │
│  │                               │   navigator.credentials.get()             │
│  │                               │   with challenge + PRF eval               │
│  │                               │   (auth page or popup context)            │
│  │                               │   ▼                                       │
│  │                               │   Encrypted payload assembled             │
│  │                               │   { zkProof, assertion, origin,           │
│  │                               │     code, nonce, transport_type }         │
│  │                               │   ▼                                       │
│  │                               │   Transport.send(encrypted payload)       │
│  └───────────────────────────────┴───────────────────────────────────────────┘
│                                              │                              │
│                    USB AOA 2.0 (primary)     │     WebRTC + Noise (fallback)│
│                          │                   │              │               │
│                          ▼                   │              ▼               │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐       │
│  │  Go Native Messaging Host    │   │  Signaling Server (Fly.io)   │       │
│  │  (Desktop, libusb + ECDH)    │   │  ├─ Socket.IO room relay     │       │
│  │  ├─ libusb AOA 2.0 init      │   │  ├─ /turn-credentials (ephemeral)    │
│  │  ├─ ECDH key exchange        │   │  └─ STUN/TURN ICE servers    │       │
│  │  └─ AES-256-GCM tunnel       │   │                              │       │
│  └──────────────┬───────────────┘   └──────────────┬───────────────┘       │
│                 │                                  │                        │
│                 └──────────────────┬───────────────┘                        │
│                                    ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                      ANDROID VAULT (V6)                                ││
│  │  apps/android-vault/                                                   ││
│  │  ├─ Java Orchestrator                                                  ││
│  │  │   ├─ AoaTransport.kt        (USB AOA receiver)                     ││
│  │  │   ├─ WebRtcTransport.kt     (WebRTC fallback receiver)             ││
│  │  │   ├─ DualTransportManager.kt (auto-select + monitor)               ││
│  │  │   ├─ AttestationVerifier.java (zkTLS ECDSA verify)                 ││
│  │  │   ├─ ChallengeVerifier.java  (recompute + compare)                 ││
│  │  │   ├─ WebAuthnVerifier.java   (assertion sig verify)                ││
│  │  │   ├─ HardwareInterruptGate.kt (QES ARMED state)                    ││
│  │  │   ├─ GhostActuatorService.kt (AccessibilityService)                ││
│  │  │   ├─ QesOverlayService.kt    (non-obscuring overlay)               ││
│  │  │   ├─ AuditLogger.kt         (device-attestation signed log)        ││
│  │  │   └─ HapticNotifier.kt      (SOS vibrate pattern)                  ││
│  │  │                                                                    ││
│  │  │   decrypt → verify ECDSA → validate session → recompute challenge   ││
│  │  │   → verify WebAuthn assertion → check approval mode (PIN1/PIN2)    ││
│  │  │                                                                    ││
│  │  ├─ NDK Enclave (libvault_enclave.so)                                 ││
│  │  │   ├─ mlock allocator                                              ││
│  │  │   ├─ Keystore JNI bridge (Cipher.doFinal direct ByteBuffer)        ││
│  │  │   ├─ PIN-to-coordinate mapper                                      ││
│  │  │   └─ explicit_bzero sanitizer                                      ││
│  │  │                                                                    ││
│  │  │   biometric unlock → decrypt PIN → map to float[x,y] → zero buffer ││
│  │  │                                                                    ││
│  │  └─ Ghost Actuator                                                    ││
│  │      ├─ PinGridAnalyzer.kt   (Accessibility tree bounds)              ││
│  │      ├─ GestureBuilder.kt    (StrokeDescription sequence)             ││
│  │      └─ dispatchGesture()   (FLAG_SECURE bypass)                      ││
│  │                                                                     ││
│  │         float[x,y] coordinates → human-like taps on Smart-ID app      ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│                                    ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                    eIDAS QES HARDWARE GATE                             ││
│  │  PIN2 path:                                                            ││
│  │    ARMED → Volume Down press → RELEASED → EXECUTED → audit log        ││
│  │  PIN1 path:                                                            ││
│  │    auto-approved → EXECUTED → audit log                               ││
│  └────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Content Script Detection

**Trigger:** User clicks the Smart-ID login button on a whitelisted RP (`lhv.ee`, `swedbank.ee`, `seb.ee`, `tara.ria.ee`).

**Input:** DOM `click` event on a known Smart-ID login element.

**Process:**
1. `entrypoints/content/content-script.ts` detects the click via event delegation or `MutationObserver` (debounced at 200ms).
2. Content script scrapes the control code from the DOM (searches for 4-digit pattern in known selectors: `.control-code`, `.smartid-code`, `[data-testid="control-code"]`).
3. Content script emits a `detect-smartid-login` message to the background service worker with payload:
   ```json
   {
     "type": "detect-smartid-login",
     "payload": {
       "domain": "lhv.ee",
       "url": "https://www.lhv.ee/auth/smart-id",
       "controlCodeDom": "4892",
       "timestamp": 1715000000000
     }
   }
   ```
4. Content script returns `true` from `onMessage` listener (Chrome MV3 async requirement).

**Output:** `detect-smartid-login` message dispatched to background; DOM-scraped control code stored temporarily in `chrome.storage.session` under key `pendingSmartIdRequest`.

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `DOM_CODE_NOT_FOUND` | Control code not yet rendered in DOM (SPA async load) | Retry with exponential backoff (3 attempts, 500ms, 1s, 2s) | User must enter PIN manually on phone |
| `INVALID_CODE_FORMAT` | Scraped text is not 4 digits | Log warning; reject message | DOM-only mode with security warning in popup |
| `NON_WHITELISTED_DOMAIN` | Domain not in `TRUSTED_RP_KEYS` manifest | Ignore message; do not initiate V6 flow | Standard Smart-ID flow (user enters PIN manually) |
| `CONTENT_SCRIPT_CONTEXT_INVALID` | Extension context invalidated during detection | Suppress error; do not retry | Page reload required |
| `TAB_ID_UNAVAILABLE` | `sender.tab?.id` is undefined | Fallback to `browser.tabs.query({ active: true, currentWindow: true })` | If still unavailable, abort with log |

**Files:** `entrypoints/content/content-script.ts`, `lib/transaction/lhvDetector.ts` (bank-specific detector pattern), `types/index.ts` (`MessageType.DETECT_SMARTID_LOGIN`).

---

## Stage 2: zkTLS Attestation

**Trigger:** Background service worker receives `detect-smartid-login` AND `chrome.webRequest.onHeadersReceived` has captured a `SmartID-Attestation` response header.

**Input:** RP domain, page URL, `SmartID-Attestation` header string, DOM-scraped control code (from Stage 1).

**Process:**
1. `chrome.webRequest.onHeadersReceived` listener in `entrypoints/background/service-worker.ts` intercepts the response header:
   ```
   SmartID-Attestation: v1;<base64url(json-payload)>;<base64url(sig)>;<key-id>
   ```
2. `lib/zktls/verifyAttestation.ts` parses the header:
   - Split on `;`; expect 4 parts with version `v1`.
   - Base64url-decode payload and signature (RFC 4648 §5, no padding).
   - Canonical JSON stringify the payload (sorted keys) → UTF-8 bytes.
3. Look up `TrustedRpSigningKey` in `TRUSTED_RP_KEYS[domain][keyId]`.
4. `crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, payloadBytes)`.
5. Validate timestamp: `|now - payload.ts| <= 30` seconds.
6. Cross-reference attested `payload.code` with `controlCodeDom` from Stage 1:
   - Match: highest confidence (`attestationConfidence: 'high'`).
   - Mismatch: use attested code, log `RAT_DOM_MUTATION_DETECTED`, set confidence to `medium`.
   - Missing header: degrade to DOM-only (`attestationConfidence: 'low'`), set `domOnlyMode: true`.

**Output:**
```typescript
interface AttestedCode {
  controlCode: string;      // e.g. "4892"
  signature: string;        // base64url ECDSA sig
  keyId: string;            // e.g. "lhv-2026q2"
  session: string;          // from payload.session
  ts: number;               // from payload.ts
  confidence: 'high' | 'medium' | 'low';
  domOnlyMode: boolean;
}
```

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `HEADER_MISSING` | Bank did not include `SmartID-Attestation` header | Log; set `domOnlyMode: true` | DOM-only mode with security warning popup |
| `INVALID_HEADER_FORMAT` | Header does not match `v1;payload;sig;keyId` | Log; set `domOnlyMode: true` | DOM-only mode |
| `UNKNOWN_KEY_ID` | `keyId` not found in `TRUSTED_RP_KEYS[domain]` | Log; trigger background manifest refresh; set `domOnlyMode: true` | DOM-only mode; manual update available in popup settings |
| `SIGNATURE_INVALID` | `crypto.subtle.verify()` returns `false` | Log `CRITICAL_ATTESTATION_FAILURE`; set `domOnlyMode: true`; notify user with warning banner | DOM-only mode; security team alert |
| `TIMESTAMP_EXPIRED` | `\|now - ts\| > 30s` | Log; reject attestation; set `domOnlyMode: true` | DOM-only mode (clock skew or replay) |
| `DOM_ATTESTATION_MISMATCH` | Attested code != DOM-scraped code | Use attested code; log `RAT_DOM_MUTATION_DETECTED`; show "Page may be compromised" warning | Continue with attested code |

**DOM-Only Fallback Mode:**
- Popup displays yellow warning banner: "Server attestation unavailable. Using page content only — verify the control code matches your Smart-ID app."
- The remaining stages proceed with `domOnlyMode: true`, skipping zkTLS proof delivery but still performing challenge-bound WebAuthn and transport.
- Android Vault receives `domOnlyMode: true` and performs assertion verification with relaxed attestation checks (still verifies WebAuthn binding).

**Performance Budget:** < 20ms total (< 1ms interception + < 5ms parsing + < 10ms ECDSA verify + < 1ms cross-reference + < 3ms overhead).

**Files:** `lib/zktls/verifyAttestation.ts`, `lib/zktls/trustedKeys.ts`, `entrypoints/background/service-worker.ts` (webRequest listener).

---

## Stage 3: Challenge-Bound WebAuthn

**Trigger:** zkTLS attestation completed (or DOM-only mode confirmed). Background service worker initiates WebAuthn assertion with a challenge derived from the attested control code.

**Input:** Attested control code (`controlCode`), zkTLS proof object (`signature`, `keyId`, `session`, `ts`), origin (`https://www.lhv.ee`), `domOnlyMode` flag.

**Process:**
1. `lib/webauthn/challengeDerivation.ts` computes:
   ```typescript
   const nonce = crypto.getRandomValues(new Uint8Array(16)); // 128-bit session nonce
   const challengeInput = canonicalJsonStringify({
     zkProof: domOnlyMode ? null : { signature, keyId, session, ts },
     origin,
     controlCode,
     nonce: arrayBufferToBase64url(nonce)
   });
   const challenge = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challengeInput));
   ```
   > **Security note:** Canonical JSON with sorted keys prevents hash ambiguity/length extension attacks.
2. Background stores `pendingChallengeInput` and `nonce` in `chrome.storage.session`.
3. WebAuthn assertion invoked. Context requirements (MV3):
   - Primary: `entrypoints/popup/` popup is open → invoke from popup React component.
   - Secondary: `entrypoints/auth/` dedicated auth page → `chrome.windows.create({ url: 'auth.html', type: 'popup' })`.
   - Tertiary: `entrypoints/offscreen-webrtc/` offscreen document (if no other UI context available; offscreen docs have limited credential API support).
4. `navigator.credentials.get({ publicKey: { challenge, rpId: undefined, allowCredentials: [], userVerification: 'required', extensions: { prf: { eval: { first: salt } } } } })`.
5. User sees platform biometric prompt (Windows Hello / TouchID / fingerprint). The OS dialog may display the origin and challenge (platform-dependent).
6. Extract `assertion.response.authenticatorData`, `assertion.response.clientDataJSON`, `assertion.response.signature`.

**Output:**
```typescript
interface ChallengeBoundAssertion {
  authenticatorData: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  signature: ArrayBuffer;
  challengeInput: string;        // canonical JSON that was hashed
  nonce: string;                 // base64url session nonce
  prfOutput?: ArrayBuffer;       // 32-byte re-auth key (if PRF available)
}
```

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `USER_CANCELLATION` | User dismisses biometric prompt or presses Escape | Log; clear `pendingSmartIdRequest`; show "Authentication cancelled" in popup | Manual PIN entry on phone |
| `PRF_UNAVAILABLE` | Platform authenticator does not support PRF extension | Proceed without `prfOutput`; session resumption falls back to explicit re-pair on next browser restart | WebAuthn assertion still valid for this transaction |
| `ORIGIN_MISMATCH` | `clientDataJSON.origin` does not match expected origin | Log `CRITICAL_ORIGIN_MISMATCH`; abort flow; show security warning | Manual PIN entry; possible phishing detected |
| `ASSERTION_TIMEOUT` | Biometric prompt times out (default 2 minutes) | Log; show "Authentication timed out" | Retry once; then manual PIN entry |
| `NO_PASSKEY` | No discoverable credential exists for this RP | Log; redirect to pairing flow (Phase 0 passkey provisioning) | User must re-pair device |
| `CHALLENGE_DERIVATION_FAILURE` | `crypto.subtle.digest` throws | Log; abort V6 flow | Manual PIN entry |

**Files:** `lib/webauthn/challengeDerivation.ts`, `lib/webauthn/assertionRequest.ts`, `entrypoints/auth/main.ts`, `entrypoints/popup/`.

---

## Stage 4: Transport (USB AOA Primary, WebRTC Fallback)

**Trigger:** WebAuthn assertion obtained. Background assembles encrypted payload and delegates to `TransportManager` for delivery to Android Vault.

**Input:** zkTLS proof + WebAuthn assertion + metadata, assembled into a Noise-encrypted payload.

**Process:**
1. `lib/transport/manager.ts` — `TransportManager.selectTransport()` evaluates availability:
   - Query USB AOA: check if Go Native Messaging Host is running and Android device is in AOA mode (`libusb` enumeration). Timeout: 500ms.
   - Query WebRTC: check if existing `RTCPeerConnection` data channel is `open`. Timeout: 500ms.
   - Decision matrix:
     - USB available → select `AoaTransport` (primary).
     - USB unavailable, WebRTC available → select `WebRtcTransport` (fallback).
     - Neither available → initiate WebRTC connection (create offscreen document, fetch TURN credentials, signal).
2. Payload assembly (background service worker):
   ```typescript
   const payload = {
     type: 'pin-authorization',
     version: 'v6',
     zkTLS: domOnlyMode ? null : { signature: attestation.signature, keyId: attestation.keyId, session: attestation.session, ts: attestation.ts },
     webAuthn: {
       authenticatorData: arrayBufferToBase64(assertion.authenticatorData),
       clientDataJSON: arrayBufferToBase64(assertion.clientDataJSON),
       signature: arrayBufferToBase64(assertion.signature),
       challengeInput: assertion.challengeInput
     },
     origin,
     controlCode: attestation.controlCode,
     nonce: assertion.nonce,
     approvalMode: isPin2 ? 'qes' : 'pin1',   // 'qes' triggers Hardware Interrupt Gate
     timestamp: Date.now()
   };
   ```
3. Encrypt payload with Noise cipher state (XX handshake already completed during pairing; session key in `chrome.storage.session`).
4. Transport-specific delivery:
   - **USB AOA**: Pass encrypted bytes to Go Native Messaging Host via `chrome.runtime.connectNative('com.smartid2.aoa_host')`. Host wraps in AES-256-GCM tunnel over AOA 2.0 bulk transfer.
   - **WebRTC**: Send over `RTCDataChannel` (reliability: ordered, maxRetransmits: 3).
5. `TransportManager.monitorQuality()` begins latency/heartbeat monitoring. If USB disconnects mid-flight, auto-fallback to WebRTC with 3 retry attempts.

**Output:** Encrypted payload delivered to Android Vault; `transportDeliveryId` returned for correlation.

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `USB_DISCONNECTED` | AOA cable unplugged or device removed during send | Log; `TransportManager.switchTransport('webrtc')`; retry payload on WebRTC | WebRTC fallback; if also unavailable, show "Reconnect USB cable or ensure phone is on same network" |
| `USB_HOST_UNAVAILABLE` | Go Native Messaging Host binary not installed or not running | Log; skip USB; attempt WebRTC | WebRTC fallback; popup shows "USB mode unavailable — using wireless" (info, not error) |
| `WEBRTC_SIGNALING_FAILURE` | Socket.IO connection to signaling server fails | Retry signaling with exponential backoff (1s, 2s, 4s) | After 3 failures, show "Cannot reach signaling server. Check internet connection." |
| `WEBRTC_ICE_FAILED` | All ICE candidates fail (mDNS + TURN/UDP + TURN/TCP 443) | Log; show connection troubleshooting | Manual PIN entry; user can retry |
| `TRANSPORT_TIMEOUT` | No transport delivers payload within 15 seconds | Log; abort V6 flow; clear pending request | Manual PIN entry; popup shows "Unable to connect to phone" with Retry button |
| `NOISE_CIPHER_FAILURE` | Session key missing or corrupted (e.g., browser restart wiped `chrome.storage.session`) | Trigger PRF silent re-auth if possible; else redirect to re-pairing | If PRF re-auth succeeds, retry automatically |
| `PAYLOAD_TOO_LARGE` | Encrypted payload exceeds transport MTU | Fragment payload; reassemble on Android side | N/A (handled transparently) |

**Retry Policy:**
- USB: 1 immediate retry on disconnect, then WebRTC fallback.
- WebRTC: 3 attempts with exponential backoff (1s, 2s, 4s).
- Total transport budget: 15 seconds before hard timeout.

**Files:** `lib/transport/manager.ts`, `lib/transport/aoaTransport.ts`, `lib/transport/webRtcTransport.ts`, `entrypoints/background/offscreenWebrtc.ts`, `signaling-server/server.js` (`/turn-credentials` endpoint).

---

## Stage 5: Android Verification

**Trigger:** Android Vault receives encrypted payload via `AoaTransport.kt` or `WebRtcTransport.kt`.

**Input:** Noise-decrypted JSON payload containing zkTLS proof, WebAuthn assertion, origin, control code, nonce, approval mode.

**Process:**
1. `DualTransportManager.kt` routes payload to `Java Orchestrator`.
2. `AttestationVerifier.java` (if `zkTLS` is not null):
   - Base64url-decode signature.
   - Canonical JSON stringify payload → UTF-8 bytes.
   - `java.security.Signature.getInstance("SHA256withECDSA")` initialized with local `TrustedRpSigningKey`.
   - `signature.initVerify(publicKey)` → `signature.verify(sigBytes)`.
   - Validate timestamp: `|System.currentTimeMillis() / 1000 - ts| <= 30`.
3. `ChallengeVerifier.java`:
   - Recompute `challengeInput` JSON from received fields (`zkTLS`, `origin`, `controlCode`, `nonce`).
   - `MessageDigest.getInstance("SHA-256").digest(challengeInput.getBytes(UTF_8))`.
   - Extract challenge from `clientDataJSON` (parse JSON, read `challenge` field as base64url).
   - Constant-time compare (`MessageDigest.isEqual`) recomputed challenge vs assertion challenge.
4. `WebAuthnVerifier.java`:
   - Verify assertion signature against stored passkey public key (from Phase 0 pairing).
   - Verify `authenticatorData.rpIdHash` matches expected origin hash.
   - Verify `authenticatorData.userPresent` and `userVerified` flags are set.
   - Check assertion is not in replay cache (sliding window: 5 minutes, max 1000 entries).
5. `SessionValidator.java`:
   - Verify `session` identifier matches current active session or is within valid window.
   - Check `timestamp` is within 60 seconds of arrival (transport latency tolerance).
6. If all checks pass → emit `AUTHORIZED` signal with `approvalMode` (`pin1` or `qes`).
   - `pin1`: route directly to NDK enclave.
   - `qes`: route to `HardwareInterruptGate.kt` (Stage 7 arming).

**Output:** `AuthorizationResult` — either `APPROVED(pinMode)` or `REJECTED(reason)`.

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `SIGNATURE_INVALID` | ECDSA verify returns `false` on Android side | Log `ANDROID_ATTESTATION_FAILURE`; send rejection to extension | Extension shows "Server verification failed" — manual PIN entry |
| `SESSION_MISMATCH` | `session` ID does not match active or recent session | Log; send `SESSION_INVALID` rejection | Extension triggers re-pairing prompt |
| `CHALLENGE_MISMATCH` | Recomputed challenge != assertion challenge | Log `CRITICAL_CHALLENGE_MISMATCH`; send rejection | Extension shows "Transaction may have been tampered with" — manual PIN entry |
| `ASSERTION_REPLAY` | Same assertion signature seen in replay cache | Log `REPLAY_ATTACK_DETECTED`; send rejection; alert security team | Block transaction; user must generate new assertion |
| `ORIGIN_MISMATCH_ANDROID` | `origin` in payload does not match `rpIdHash` | Log; send rejection | Extension shows "Website origin mismatch" — possible phishing |
| `TIMESTAMP_STALE` | Payload timestamp > 60s old upon arrival | Log; send `TIMEOUT` rejection | Extension shows "Request expired. Please try again." |
| `KEY_NOT_FOUND` | Passkey public key missing from Android trust-store | Log; send `UNPAIRED` rejection | Extension redirects to pairing flow |
| `NOISE_DECRYPT_FAILURE` | Session key mismatch (e.g., extension restarted, new IK handshake) | Log; send `SESSION_EXPIRED` | Extension attempts PRF re-auth; if successful, user retries |

**Files:** `apps/android-vault/AttestationVerifier.java`, `apps/android-vault/ChallengeVerifier.java`, `apps/android-vault/WebAuthnVerifier.java`, `apps/android-vault/DualTransportManager.kt`.

---

## Stage 6: NDK Enclave + Ghost Actuator

**Trigger:** `AuthorizationResult.APPROVED(pinMode)` received from verification layer.

**Input:** `pinMode` (`'pin1'` or `'pin2'`), Smart-ID app package name (`ee.smartid`), Accessibility node tree root.

**Process:**

**6A. NDK Enclave Decryption**
1. `GhostActuatorService.kt` invokes `PinGridAnalyzer.kt` to walk the Accessibility node tree and extract:
   - PIN grid bounding box (`Rect` of the parent container).
   - Individual digit button centers (`float[x, y]` for digits 0-9).
   - Grid dimensions (typically 3×3 + 0, or 4×3).
2. `JniPinBridge.kt` calls into `libvault_enclave.so` via JNI:
   ```cpp
   // C++ NDK interface
   extern "C" JNIEXPORT jfloatArray JNICALL
   Java_com_smartid2_enclave_EnclaveBridge_decryptAndMap(
       JNIEnv* env,
       jobject thiz,
       jobject layoutBounds,      // Rect as direct ByteBuffer
       jstring keystoreAlias,     // "smartid_pin1" or "smartid_pin2"
       jfloatArray buttonCenters  // [x0,y0,x1,y1,...]
   );
   ```
3. Inside the enclave (`libvault_enclave/pinDecrypt.cpp`):
   - `mlock()` a 16-byte buffer for the decrypted PIN.
   - Call back to Java `Cipher.doFinal(ByteBuffer, ByteBuffer)` with a **direct** `ByteBuffer` output pointing to the `mlock`-ed native buffer (zero-copy, never touches JVM heap).
   - Android Keystore enforces biometric unlock (`setUserAuthenticationRequired(true)`) and unlocked device (`setUnlockedDeviceRequirement(true)`).
   - Map each decrypted digit (0-9) to the corresponding `float[x, y]` from `buttonCenters`.
   - `explicit_bzero(pinBuffer, 16)`.
   - `munlock(pinBuffer, 16)`.
   - Return `jfloatArray` of coordinates (e.g., `[x1, y1, x2, y2, x3, y3, x4, y4]` for a 4-digit PIN).
4. JVM layer (`JniPinBridge.kt`) receives only the coordinate array. It never logs, stores, or inspects the coordinates.

**6B. Ghost Actuator Execution**
1. `GestureBuilder.kt` converts coordinate array to `GestureDescription.StrokeDescription` sequence:
   - Each tap: `StrokeDescription(Path(x,y → x,y), 0, 50)` (50ms duration).
   - Inter-tap delay: 100ms (configurable).
   - Optional: add small random jitter to coordinates (±2px) and timing (±10ms) to simulate human variance.
2. `GhostActuatorService.kt` calls `dispatchGesture(gestureDescription, callback, handler)`.
3. `FLAG_SECURE` bypass: The gesture is injected at the OS level, not through Accessibility node actions, so it reaches the Smart-ID app's secure window.
4. `ExecutionConfirmation.kt` monitors Accessibility events for:
   - Screen transition (Smart-ID app moves from PIN entry to confirmation) → `SUCCESS`.
   - Error dialog ("Wrong PIN") → `FAILURE`.
   - Timeout (10s with no state change) → `FAILURE`.
5. On success, the Smart-ID app submits the PIN to the server; the RP receives the authentication/signature confirmation.

**Output:** `ActuationResult` — `SUCCESS`, `FAILURE(reason)`, or `FALLBACK_REQUIRED`.

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `BIOMETRIC_LOCKOUT` | Too many failed biometric attempts on Android Keystore | Log; send `BIOMETRIC_LOCKOUT` to extension | Extension shows "Biometric lockout on phone. Unlock phone manually." — manual PIN entry |
| `KEYSTORE_DECRYPT_FAILURE` | Android Keystore key invalidated (e.g., biometric enrollment changed) | Log; send `KEY_INVALIDATED` to extension | Extension redirects to PIN re-enrollment flow |
| `ENCLAVE_MEMORY_PRESSURE` | `mlock()` fails (insufficient RLIMIT_MEMLOCK) | Log; retry once with standard `malloc` (degraded security warning) | If retry fails, manual PIN entry |
| `JNI_CRASH` | NDK library crashes during decryption | Catch signal via `sigaction` in C++; `explicit_bzero` in signal handler; send `ENCLAVE_ERROR` | Extension shows "Secure module error" — manual PIN entry |
| `GESTURE_DISPATCH_FAILURE` | `dispatchGesture()` returns `false` | Retry up to 2 times with adjusted coordinates; if still failing, send `ACTUATION_FAILED` | Extension offers "Retry" or "Enter manually on phone" |
| `PIN_GRID_NOT_FOUND` | Accessibility tree does not contain Smart-ID PIN grid | Retry after 500ms (grid may still be animating in); if still missing, send `UI_NOT_FOUND` | User must enter PIN manually |
| `SMART_ID_APP_NOT_FOREGROUND` | Smart-ID app is not the current foreground app | Send notification to bring Smart-ID to foreground; wait 5s; retry once | If still not foreground, manual PIN entry |
| `EXECUTION_TIMEOUT` | No success/failure signal within 10s | Log; send `TIMEOUT` | Manual PIN entry |

**Files:** `apps/android-vault/libvault_enclave/`, `apps/android-vault/GhostActuatorService.kt`, `apps/android-vault/GestureBuilder.kt`, `apps/android-vault/PinGridAnalyzer.kt`, `apps/android-vault/JniPinBridge.kt`.

---

## Stage 7: eIDAS QES Gate

**Trigger:** `approvalMode === 'qes'` (PIN2 signing request) AND Stage 5 verification passed.

**Input:** Authorized QES request from Java Orchestrator.

**Process:**
1. `HardwareInterruptGate.kt` transitions to `ARMED` state.
2. `QesOverlayService.kt` displays a **non-obscuring, non-clickable** system overlay at the top of the screen:
   - Text: "QES ARMED. Verify amount on Smart-ID app. Press VOLUME DOWN to sign."
   - Semi-transparent background; does NOT cover the Smart-ID app window.
   - Countdown timer: 30 seconds.
3. `HapticNotifier.kt` triggers SOS vibrate pattern: long (200ms) - short (100ms) - long (200ms) - pause (500ms), repeat 3 times.
4. `HardwareInterruptGate.kt` registers `onKeyDown()` listener for `KEYCODE_VOLUME_DOWN`.
   - Volume Down is captured exclusively during `ARMED` state; it does NOT change system volume.
5. **User action:** User views the transaction details (amount, beneficiary, control code) on the Smart-ID app screen, then physically presses Volume Down.
6. On `KEYCODE_VOLUME_DOWN`:
   - Gate transitions `ARMED → RELEASED`.
   - Overlay dismissed immediately.
   - Ghost Actuator executes Stage 6B (PIN2 coordinate injection).
   - Gate transitions `RELEASED → EXECUTED`.
   - `AuditLogger.kt` writes cryptographically signed entry:
     ```json
     {
       "sessionId": "abc123",
       "zkTLSProofHash": "sha256(zkProof)",
       "webAuthnAssertionHash": "sha256(assertion)",
       "hardwareInterruptType": "VOLUME_DOWN",
       "interruptTimestamp": 1715000010000,
       "actuationTimestamp": 1715000010500,
       "deviceAttestation": "<ECDSA signature by device-local attestation key>"
     }
     ```
7. If 30-second timeout expires without Volume Down press:
   - Gate transitions `ARMED → CANCELLED`.
   - Overlay dismissed.
   - Ghost Actuator execution aborted.
   - Cancellation proof generated and logged.
   - Extension receives `QES_CANCELLED`.

**Output:** `QesResult` — `SIGNED(auditLogEntry)` or `CANCELLED(cancellationProof)` or `TIMEOUT`.

**Error Paths:**
| Error | Cause | Action | Fallback |
|-------|-------|--------|----------|
| `VOLUME_DOWN_NOT_CAPTURED` | System or another app intercepts Volume Down before our listener | Retry capture once; if still missed, log and abort | Manual PIN entry on phone; user can retry |
| `USER_DENIES` | User presses Volume Up or Back button instead of Volume Down | Treat as implicit denial; gate transitions to `CANCELLED` | Manual PIN entry |
| `QES_TIMEOUT` | 30 seconds elapse without Volume Down | Log cancellation; send `QES_TIMEOUT` to extension | Extension shows "Signing timed out. Please try again." |
| `OVERLAY_PERMISSION_DENIED` | `SYSTEM_ALERT_WINDOW` permission not granted | Log; skip overlay; rely on haptic + Smart-ID app UI only | Haptic-only notification still functions |
| `AUDIT_LOG_SIGN_FAILURE` | Device attestation key unavailable | Log plaintext audit entry (without device signature); flag for investigation | QES still completes; audit integrity is best-effort |
| `HAPTIC_UNAVAILABLE` | Device has no vibrator or vibrator is disabled | Skip haptic; rely on overlay + visual Smart-ID app | Visual-only notification |

**Files:** `apps/android-vault/HardwareInterruptGate.kt`, `apps/android-vault/QesOverlayService.kt`, `apps/android-vault/AuditLogger.kt`, `apps/android-vault/HapticNotifier.kt`.

---

## Error Handling Matrix

| Stage | Error | Action | User Notification | Audit Log |
|-------|-------|--------|-------------------|-----------|
| S1 | `DOM_CODE_NOT_FOUND` | Retry 3× with backoff; then abort | Popup: "Waiting for control code..." then "Could not detect code" | `warn` with URL |
| S1 | `NON_WHITELISTED_DOMAIN` | Ignore; no V6 flow initiated | None | `debug` |
| S2 | `HEADER_MISSING` | Degrade to DOM-only mode | Popup yellow banner: "Using page content only" | `warn` |
| S2 | `SIGNATURE_INVALID` | Abort V6 flow; alert security | Popup red banner: "Server verification failed" | `error` with keyId |
| S2 | `TIMESTAMP_EXPIRED` | Degrade to DOM-only | Popup: "Server response delayed. Using page content." | `warn` |
| S2 | `DOM_ATTESTATION_MISMATCH` | Use attested code; warn user | Popup orange banner: "Page may be compromised" | `warn` |
| S3 | `USER_CANCELLATION` | Clear pending request; abort | Popup: "Authentication cancelled" | `info` |
| S3 | `NO_PASSKEY` | Redirect to pairing flow | Popup: "Device not paired. Please pair your phone." | `warn` |
| S3 | `ORIGIN_MISMATCH` | Abort; flag phishing | Popup red: "Website origin mismatch — possible phishing" | `error` |
| S4 | `USB_DISCONNECTED` | Switch to WebRTC; retry | Popup: "USB disconnected. Using wireless..." (auto, info) | `info` |
| S4 | `TRANSPORT_TIMEOUT` | Abort; offer retry | Popup: "Unable to connect to phone" + Retry button | `error` |
| S4 | `WEBRTC_ICE_FAILED` | Abort after retries | Popup: "Network connection failed. Check Wi-Fi or tether USB." | `error` |
| S5 | `SIGNATURE_INVALID` | Send rejection to extension | Popup: "Phone could not verify server signature" | `error` (Android side) |
| S5 | `CHALLENGE_MISMATCH` | Send rejection; flag tampering | Popup red: "Transaction may have been tampered with" | `error` |
| S5 | `ASSERTION_REPLAY` | Block; alert security team | Popup: "Duplicate authentication detected" | `error` + security alert |
| S5 | `KEY_NOT_FOUND` | Send `UNPAIRED`; redirect | Popup: "Phone not paired. Please re-pair." | `warn` |
| S6 | `BIOMETRIC_LOCKOUT` | Send `BIOMETRIC_LOCKOUT` | Popup: "Biometric lockout on phone. Unlock manually." | `warn` |
| S6 | `KEYSTORE_DECRYPT_FAILURE` | Send `KEY_INVALIDATED` | Popup: "Phone security changed. Re-enroll PIN." | `error` |
| S6 | `JNI_CRASH` | Send `ENCLAVE_ERROR` | Popup: "Secure module error. Enter PIN manually." | `error` |
| S6 | `GESTURE_DISPATCH_FAILURE` | Retry 2×; then send `ACTUATION_FAILED` | Popup: "Could not auto-enter PIN. Enter manually?" | `warn` |
| S6 | `PIN_GRID_NOT_FOUND` | Retry once; then send `UI_NOT_FOUND` | Popup: "Smart-ID screen not detected. Check phone." | `warn` |
| S7 | `QES_TIMEOUT` | Cancel; send `QES_TIMEOUT` | Popup: "Signing timed out. Please try again." | `info` (cancellation proof) |
| S7 | `USER_DENIES` | Cancel; send `QES_CANCELLED` | Popup: "Signing cancelled." | `info` |
| S7 | `VOLUME_DOWN_NOT_CAPTURED` | Abort; manual fallback | Popup: "Hardware button not detected. Enter PIN manually." | `warn` |

---

## Timing Budget

| Stage | Max Duration | Cumulative | Notes |
|-------|--------------|------------|-------|
| S1: Content Script Detection | 2.5s (including 3 retries) | 2.5s | DOM mutation debounce + retry backoff |
| S2: zkTLS Attestation | 20ms | ~2.52s | Web Crypto P-256 verify is native and fast |
| S3: Challenge-Bound WebAuthn | 10s | ~12.5s | User biometric prompt dominates; platform timeout is 2min but we budget 10s for UX |
| S4: Transport Delivery | 5s (USB) / 15s (WebRTC) | ~17.5s (USB) / ~27.5s (WebRTC) | USB is near-instant; WebRTC includes ICE + TURN relay |
| S5: Android Verification | 200ms | ~17.7s (USB) / ~27.7s (WebRTC) | ECDSA verify + challenge recompute + assertion verify |
| S6A: NDK Enclave Decryption | 500ms | ~18.2s / ~28.2s | Biometric prompt on phone + Keystore decrypt + coordinate mapping |
| S6B: Ghost Actuator Execution | 2s | ~20.2s / ~30.2s | 4 digits × (50ms tap + 100ms delay) + confirmation polling |
| S7: eIDAS QES Gate (PIN2 only) | 30s | ~50.2s / ~60.2s | Hardware interrupt timeout dominates; typical user response is 3-5s |
| **Total (PIN1, USB)** | **~20s** | | User sees biometric prompt on PC; phone auto-completes |
| **Total (PIN1, WebRTC)** | **~30s** | | Slightly slower due to wireless transport |
| **Total (PIN2/QES, USB)** | **~50s** | | Includes mandatory 30s hardware interrupt window |
| **Total (PIN2/QES, WebRTC)** | **~60s** | | Wireless + hardware interrupt |

**Performance Targets:**
- 95th percentile PIN1 USB completion: < 25 seconds.
- 95th percentile PIN1 WebRTC completion: < 35 seconds.
- 95th percentile PIN2/QES completion: < 65 seconds.
- Hard abort if cumulative exceeds 90 seconds (extension shows timeout error).

---

## Data Formats

### Inter-Stage Payload: `detect-smartid-login` (S1 → Background)

```typescript
// types/index.ts
interface DetectSmartIdLoginMessage {
  type: MessageType.DETECT_SMARTID_LOGIN;
  payload: {
    domain: string;           // e.g. "lhv.ee"
    url: string;              // full URL
    controlCodeDom: string | null;  // 4-digit code or null if not found
    timestamp: number;        // Date.now()
  };
}
```

### Inter-Stage Payload: Attestation Result (S2 → S3)

```typescript
// lib/zktls/types.ts
interface AttestedCode {
  controlCode: string;
  signature: string;        // base64url ECDSA P-256 signature (64 bytes encoded)
  keyId: string;
  session: string;
  ts: number;
  confidence: 'high' | 'medium' | 'low';
  domOnlyMode: boolean;
}
```

### Inter-Stage Payload: Challenge-Bound Assertion (S3 → S4)

```typescript
// lib/webauthn/types.ts
interface ChallengeBoundAssertion {
  authenticatorData: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  signature: ArrayBuffer;
  challengeInput: string;   // canonical JSON that was SHA-256 hashed
  nonce: string;            // base64url 128-bit nonce
  prfOutput?: ArrayBuffer;  // 32-byte re-auth key
}
```

### Inter-Stage Payload: V6 Transport Payload (S4 → S5, Noise-encrypted)

```json
{
  "type": "pin-authorization",
  "version": "v6",
  "zkTLS": {
    "signature": "base64url_ecdsa_sig",
    "keyId": "lhv-2026q2",
    "session": "abc123",
    "ts": 1715000000
  },
  "webAuthn": {
    "authenticatorData": "base64url",
    "clientDataJSON": "base64url",
    "signature": "base64url",
    "challengeInput": "{\"zkProof\":{...},\"origin\":\"https://www.lhv.ee\",\"controlCode\":\"4892\",\"nonce\":\"...\"}"
  },
  "origin": "https://www.lhv.ee",
  "controlCode": "4892",
  "nonce": "base64url_nonce",
  "approvalMode": "pin1",
  "timestamp": 1715000000000,
  "domOnlyMode": false
}
```

When `domOnlyMode: true`, the `zkTLS` field is `null` and Android verification skips attestation signature verification but still performs challenge recomposition and WebAuthn assertion verification.

### Inter-Stage Payload: Authorization Result (S5 → S6/S7)

```typescript
// Android-side Kotlin
sealed class AuthorizationResult {
  data class Approved(
    val pinMode: PinMode,       // PIN1 or PIN2
    val controlCode: String,
    val sessionId: String,
    val auditContext: AuditContext
  ) : AuthorizationResult()

  data class Rejected(
    val reason: RejectionReason,
    val message: String,
    val retryable: Boolean
  ) : AuthorizationResult()
}

enum class PinMode { PIN1, PIN2 }
enum class RejectionReason {
  SIGNATURE_INVALID,
  SESSION_MISMATCH,
  CHALLENGE_MISMATCH,
  ASSERTION_REPLAY,
  ORIGIN_MISMATCH,
  TIMESTAMP_STALE,
  KEY_NOT_FOUND,
  NOISE_DECRYPT_FAILURE
}
```

### Inter-Stage Payload: Actuation Result (S6 → Extension Response)

```typescript
// Android → Extension (Noise-encrypted response)
interface ActuationResult {
  status: 'success' | 'failure' | 'fallback_required';
  reason?: string;           // e.g. "GESTURE_DISPATCH_FAILURE"
  controlCode: string;
  sessionId: string;
  timestamp: number;
}
```

### Inter-Stage Payload: QES Result (S7 → Extension Response)

```json
{
  "status": "signed",
  "controlCode": "4892",
  "sessionId": "abc123",
  "auditLogEntry": {
    "sessionId": "abc123",
    "zkTLSProofHash": "sha256:...",
    "webAuthnAssertionHash": "sha256:...",
    "hardwareInterruptType": "VOLUME_DOWN",
    "interruptTimestamp": 1715000010000,
    "actuationTimestamp": 1715000010500,
    "deviceAttestation": "base64url_ecdsa_sig"
  },
  "timestamp": 1715000010500
}
```

Or for cancellation:
```json
{
  "status": "cancelled",
  "reason": "QES_TIMEOUT",
  "cancellationProof": "base64url_signed_blob",
  "controlCode": "4892",
  "sessionId": "abc123",
  "timestamp": 1715000040000
}
```

---

## Full Scenario: V6 Smart-ID Login with QES Signing

**WHEN** the user navigates to `https://www.lhv.ee` and initiates Smart-ID login for a payment requiring PIN2 (QES)
**THEN** the content script SHALL detect the Smart-ID login button click via `MutationObserver`
**AND** emit `detect-smartid-login` with the DOM-scraped control code to the background service worker

**WHEN** the background receives the detection message
**THEN** `chrome.webRequest.onHeadersReceived` SHALL have intercepted the `SmartID-Attestation: v1;...` header
**AND** `verifyAttestation()` in `lib/zktls/verifyAttestation.ts` SHALL verify the ECDSA P-256 signature against `TRUSTED_RP_KEYS['lhv.ee']['lhv-2026q2']`
**AND** cross-reference the attested code with the DOM-scraped code
**AND** store the attested result with `confidence: 'high'`

**WHEN** attestation succeeds
**THEN** `challengeDerivation.ts` SHALL compute `Challenge = SHA-256(zkProof || origin || code || nonce)`
**AND** invoke `navigator.credentials.get()` with the derived challenge
**AND** the user SHALL see the platform biometric prompt (Windows Hello / TouchID)

**WHEN** the user authenticates with their biometric
**THEN** the extension SHALL assemble the V6 payload `{ zkTLS, webAuthn, origin, controlCode, nonce, approvalMode: 'qes' }`
**AND** `TransportManager.selectTransport()` SHALL detect the USB AOA connection and choose `AoaTransport`
**AND** encrypt the payload with the Noise session cipher
**AND** deliver it via the Go Native Messaging Host over AOA 2.0

**WHEN** the Android Vault receives the payload
**THEN** `DualTransportManager.kt` SHALL decrypt via Noise
**AND** `AttestationVerifier.java` SHALL verify the zkTLS ECDSA signature
**AND** `ChallengeVerifier.java` SHALL recompute the challenge and constant-time compare with the assertion
**AND** `WebAuthnVerifier.java` SHALL verify the assertion signature against the stored passkey public key
**AND** `SessionValidator.java` SHALL validate the session and timestamp

**WHEN** all cryptographic verification passes
**AND** `approvalMode` is `qes`
**THEN** `HardwareInterruptGate.kt` SHALL transition to `ARMED` state
**AND** `QesOverlayService.kt` SHALL display the non-obscuring overlay: "QES ARMED. Verify amount on Smart-ID app. Press VOLUME DOWN to sign."
**AND** `HapticNotifier.kt` SHALL trigger the SOS vibrate pattern
**AND** the extension popup SHALL display "QES ARMED — verify on phone"

**WHEN** the user views the transaction on the Smart-ID app screen and presses Volume Down
**THEN** the gate SHALL transition `ARMED → RELEASED → EXECUTED`
**AND** the overlay SHALL dismiss
**AND** the NDK enclave (`libvault_enclave.so`) SHALL:
  - `mlock()` a buffer,
  - decrypt PIN2 from Android Keystore via direct `ByteBuffer` (zero JVM heap copy),
  - map each digit to anonymous `float[x, y]` coordinates,
  - `explicit_bzero()` the buffer,
  - return coordinates to Java

**WHEN** `GhostActuatorService.kt` receives the coordinate array
**THEN** `GestureBuilder.kt` SHALL construct `GestureDescription.StrokeDescription` taps
**AND** call `dispatchGesture()` to inject human-like taps on the Smart-ID app's `FLAG_SECURE` PIN grid
**AND** `ExecutionConfirmation.kt` SHALL monitor for screen transition confirming PIN acceptance

**WHEN** the PIN is accepted
**THEN** the Smart-ID app SHALL submit the signed transaction to the RP
**AND** `AuditLogger.kt` SHALL write a device-attestation-signed log entry
**AND** the extension popup SHALL display "QES signature completed"
**AND** the user SHALL see the transaction confirmation on the RP website

---

## Full Scenario: V6 Degradation to DOM-Only Mode

**WHEN** the user navigates to a whitelisted RP but the bank's server does not include the `SmartID-Attestation` header
**THEN** `verifyAttestation()` SHALL return `null` with `domOnlyMode: true`
**AND** the popup SHALL display the yellow banner: "Server attestation unavailable. Using page content only — verify the control code matches your Smart-ID app."

**WHEN** the flow continues in DOM-only mode
**THEN** challenge derivation SHALL use `zkProof: null` in the challenge input
**AND** WebAuthn assertion SHALL still proceed with the DOM-scraped control code
**AND** transport SHALL deliver the payload normally
**AND** Android Vault SHALL skip attestation signature verification
**BUT** SHALL still perform challenge recomposition and WebAuthn assertion verification
**AND** the flow SHALL complete with the same security properties for the WebAuthn binding
**BUT** with reduced confidence in the control code origin (DOM-only is vulnerable to RAT mutation)

---

## Full Scenario: USB Disconnect Mid-Flow with WebRTC Fallback

**WHEN** the user initiates V6 login and USB AOA is the active transport
**AND** the USB cable is accidentally unplugged after the payload is queued but before Android ack
**THEN** `TransportManager.monitorQuality()` SHALL detect the disconnect within 500ms
**AND** `TransportManager.switchTransport('webrtc')` SHALL initiate WebRTC fallback:
  - Create offscreen document if not existing
  - Fetch TURN credentials from `GET /turn-credentials`
  - Initiate ICE candidate waterfall: mDNS → TURN/UDP → TURN/TCP 443
**AND** the payload SHALL be retransmitted over the WebRTC data channel
**AND** the popup SHALL briefly show "USB disconnected. Using wireless..." then clear

**WHEN** the WebRTC connection establishes (typical 3-5s with TURN relay)
**THEN** the Android Vault SHALL receive the payload via `WebRtcTransport.kt`
**AND** the remaining stages (S5-S7) SHALL complete transparently
**AND** the user SHALL NOT need to re-authenticate with WebAuthn

---

## Cross-Cutting Requirements

### Requirement: Session Resumption via PRF

After a browser restart, the extension SHALL silently re-authenticate using the WebAuthn PRF discoverable credential (`mediation: 'silent'`), derive the re-authentication key, re-establish the Noise session (IK handshake), and then proceed with the V6 flow exactly as above. See `integration-flow/spec.md` "Silent re-authentication after browser restart" for Phase 1 details; in V6, the PRF re-auth enables the transport layer but does not replace challenge-bound WebAuthn for the actual transaction — it only restores the Noise session so that Stage 4 can proceed without re-pairing.

### Requirement: V6 vs Phase 1 Credential Isolation

The Phase 1 `credential-request` flow (website passwords) and the V6 `pin-authorization` flow SHALL use separate Android Keystore key aliases (`credential_vault_key` vs `smartid_pin1`/`smartid_pin2`). The Phase 1 vault returns data over the Noise channel to the extension. The V6 vault decrypts into the NDK enclave `mlock` buffer only. No code path SHALL cross between the two vaults.

### Requirement: Audit Trail Completeness

Every V6 transaction SHALL generate at minimum:
- Extension-side log: domain, control code, attestation confidence, transport type, WebAuthn assertion hash, timestamps for S1-S4.
- Android-side log: attestation verification result, challenge match result, assertion verification result, hardware interrupt type (PIN2), actuation result, device-attestation signature.
- Both logs SHALL include the same `sessionId` for correlation.
- Logs SHALL be retained for 90 days on-device (Android) and 30 days in-extension (background `chrome.storage.local` with size cap).

### Requirement: Extension Manifest Permissions

The V6 extension requires the following permissions in addition to Phase 1:
- `webRequest` + `webRequestBlocking` (for `onHeadersReceived` interception of `SmartID-Attestation`).
- `nativeMessaging` (for Go Native Messaging Host USB AOA communication).
- `system.display` (optional, for transport quality monitoring).

No new host permissions are required beyond the existing whitelisted RP domains.
