# V6 Threat Model

## Document Control

| Version | Date | Author | Change Description |
|---|---|---|---|
| 1.0 | 2026-05-04 | Security Architecture | Initial STRIDE threat model for V6 (Phase 2) components |

## Scope

This threat model covers Phase 2 (V6) components introduced in the migration from the WebRTC-based phone-as-vault architecture (Phase 1) to the tethered USB AOA + zkTLS + NDK enclave architecture (V6 Ultimate):

1. **zkTLS Signed-Header Attestation Engine** — ECDSA P-256 response header verification (`SmartID-Attestation`)
2. **Challenge-Bound WebAuthn** — SHA-256 challenge derivation binding zkTLS proof, origin, control code, and session nonce
3. **USB AOA 2.0 Transport** — Go Native Messaging Host + `libusb` + raw bulk endpoint encryption
4. **Android NDK Enclave** — C++ `mlock`'d PIN buffer, Keystore JNI bridge, `explicit_bzero` sanitization
5. **Ghost Actuator** — `AccessibilityService.dispatchGesture()` blind actuation via anonymous X/Y coordinates
6. **eIDAS QES Gate** — Volume Down hardware interrupt, non-obscuring overlay, cryptographic audit trail

**Out of scope**: Phase 1 WebRTC transport threats (covered in archived `2026-05-01-architectural-security-audit`), generic browser extension threats (XSS in popup, CSP bypass), and Smart-ID backend RP infrastructure threats.

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY: Host PC Operating System (UNTRUSTED)                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Chrome Browser Sandbox (semi-trusted)                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │    │
│  │  │  TB1: Extension Service Worker + Popup (trusted code, RAM-only state)  │    │    │
│  │  │  ├─ webRequest.onHeadersReceived (zkTLS header intercept)              │    │    │
│  │  │  ├─ crypto.subtle.verify() (ECDSA P-256 attestation verify)            │    │    │
│  │  │  ├─ Challenge derivation + WebAuthn invocation                         │    │    │
│  │  │  └─ chrome.runtime.sendNativeMessage() (to Go Host)                    │    │    │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │    │
│  │                                    │                                            │    │
│  │  TB2: Native Messaging Pipe (stdin/stdout JSON) — Host OS mediated            │    │
│  │                                    ▼                                            │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │    │
│  │  │  TB3: Go Native Host Binary (signed, statically compiled)              │    │    │
│  │  │  ├─ libusb-1.0 device enumeration + AOA 2.0 negotiation                │    │    │
│  │  │  ├─ ECDH X25519 key exchange (session key in host RAM only)            │    │    │
│  │  │  ├─ AES-256-GCM encrypt + monotonic sequence numbers                  │    │    │
│  │  │  └─ Bulk OUT/IN over raw USB endpoints                                │    │    │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                          │                                              │
│  TB4: USB Bus (physical wire — trust depends on physical security)                      │
│                                          ▼                                              │
│  TRUST BOUNDARY: Android Device (TRUSTED when unlocked + biometric auth)                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │  TB5: Android OS Kernel + USB Accessory Driver                                  │    │
│  │                                    │                                            │    │
│  │  TB6: Android Vault App (Java Orchestrator)                                     │    │
│  │  ├─ AES-GCM payload decrypt                                                     │    │
│  │  ├─ zkTLS proof re-verification + challenge recomposition                       │    │
│  │  ├─ WebAuthn assertion signature verification against stored passkey            │    │
│  │  ├─ AccessibilityService (Ghost Actuator)                                      │    │
│  │  ├─ Hardware Interrupt Gate (QES)                                               │    │
│  │  └─ PIN Grid Layout Analyzer                                                    │    │
│  │                                    │                                            │    │
│  │  TB7: JNI Boundary (Java ↔ C++)                                                 │    │
│  │                                    ▼                                            │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │    │
│  │  │  TB8: NDK Enclave (`libvault_enclave.so`) — C++ memory-locked        │    │    │
│  │  │  ├─ mlock() allocator                                                  │    │    │
│  │  │  ├─ Keystore direct decrypt via direct ByteBuffer (off-heap)           │    │    │
│  │  │  ├─ PIN-to-coordinate mapper                                           │    │    │
│  │  │  └─ explicit_bzero() on all exit paths                                 │    │    │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │    │
│  │                                    │                                            │    │
│  │  TB9: Android Keystore / TEE (hardware-backed, outside app process)            │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                          │                                              │
│  TB10: Smart-ID App (external, FLAG_SECURE, not under our control)                      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Threats by Component

### 1. zkTLS Signed-Header Attestation

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T01 | **Bank signing key compromise** — Attacker obtains bank's ECDSA P-256 private signing key and forges `SmartID-Attestation` headers for arbitrary control codes, completely defeating transaction context verification. | Spoofing | Critical | Key rotation with 90-day overlap windows; manifest rollback protection via monotonic per-key version; out-of-band key compromise alerting channel to extension maintainers. |
| V6-T02 | **Manifest update server compromise** — Attacker replaces the signed `TrustedRpSigningKey` manifest with keys they control, causing the extension to trust forged attestations from any domain. | Tampering | Critical | Manifest signing key pinned at extension build time (raw ECDSA P-256 public key, 65 bytes); manifest signature verified before any key update applied; key rotation for manifest signing key itself requires signed revocation+replacement by previous key. |
| V6-T03 | **Attestation header stripping by intermediary** — Corporate proxy, AV software, or local RAT strips the `SmartID-Attestation` header before it reaches the extension, forcing silent downgrade to DOM-only mode where RAT can manipulate displayed control codes. | Denial of Service | Medium | Graceful fallback to DOM-only is intentional; popup UI explicitly warns "Attestation unavailable — verify control code carefully"; cross-reference DOM-scraped code with phone push notification where possible. |
| V6-T04 | **Replay of old attestation headers** — Attacker captures a valid signed header for control code "4892" and replays it during a different session, causing the Android Vault to approve the wrong transaction. | Replay | Medium | Session identifier (`session` field) bound to current WebAuthn transaction; timestamp validated with ±30s tolerance; Android Vault recomputes challenge hash independently and rejects mismatching sessions. |
| V6-T05 | **Clock skew exploitation** — Attacker manipulates host or device clock to extend the 30-second attestation validity window, allowing replay of slightly stale headers. | Elevation | Low | ±30s tolerance only; both extension service worker and Android Vault validate timestamps against their own local monotonic clocks; reject if `\|now - ts\| > 30s` on either side. |
| V6-T06 | **Canonical JSON serialization ambiguity** — TypeScript `canonicalJsonStringify` and Android `java.security.Signature` produce different byte representations due to Unicode normalization, float formatting, or key ordering differences, causing legitimate signatures to fail or enabling signature forgery via parser differential. | Tampering | High | Lock canonical JSON spec: sorted keys, no whitespace, UTF-8 raw bytes, no float values in payload; cross-platform unit tests verify identical byte output for 10,000+ randomized payloads; use deterministic `TextEncoder` / `String.getBytes(UTF_8)` semantics. |
| V6-T07 | **Base64url parsing inconsistency** — Malformed base64url in the header exploits differences between TypeScript and Java decoders (e.g., handling of missing padding, invalid characters), leading to incorrect payload parsing or signature verification bypass. | Tampering | Medium | Strict RFC 4648 §5 decoder: reject padding characters, reject non-alphabet characters, enforce exact length expectations; both TypeScript and Java use identical validation logic from shared test vectors. |

### 2. Challenge-Bound WebAuthn

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T08 | **Passkey provisioning interception during Phase 0** — Attacker compromises the AOA tunnel or WebRTC fallback during initial pairing and substitutes their own passkey public key, enabling later assertion forgery for any transaction. | Spoofing | Critical | Phase 0 pairing requires user biometric + physical USB tether confirmation; passkey public key transmitted over AES-256-GCM encrypted AOA tunnel only; Android Vault stores public key in immutable SQLite trust-store with integrity hash; trust-on-first-use explicitly acknowledged in UI. |
| V6-T09 | **Challenge hash collision via length extension** — Attacker appends malicious data to the challenge inputs (`zkTLS_Proof \| Origin \| Control_Code \| Session_Nonce`) to produce a colliding SHA-256 hash that validates a different transaction context. | Tampering | High | Canonical serialization uses fixed-length, unambiguous delimiter format (not naive concatenation); include explicit length prefixes for each field; use domain separation string `"smartid-vault-challenge-v1"` as first block; SHA-256 is not length-extension vulnerable when used with fixed input lengths, but defense-in-depth applies. |
| V6-T10 | **WebAuthn assertion relay attack** — Attacker on the PC relays the WebAuthn assertion from a legitimate user transaction to authorize a different, malicious transaction on the Android side. | Replay | High | Assertion contains `clientDataJSON` with origin and challenge; Android Vault recomputes expected challenge from independent zkTLS proof verification and rejects mismatch; session nonce is single-use and invalidated after first verification. |
| V6-T11 | **Origin spoofing in chrome-extension:// binding** — Malicious browser extension with a different ID attempts to invoke WebAuthn with a spoofed origin, tricking the Android Vault into accepting an assertion for the wrong RP. | Spoofing | High | Passkey is bound to `chrome-extension://<exact-id>` at creation time; Android Vault stores the exact extension ID alongside the public key; assertions from mismatched `rpId` are rejected; extension ID is pinned in Android trust-store. |
| V6-T12 | **Malicious extension with same origin binding** — Attacker installs a forked or sideloaded extension with the same origin (`chrome-extension://<id>`) but malicious code, leveraging the existing passkey to authorize transactions the user did not intend. | Elevation | Medium | Chrome Web Store publication with publisher verification; MV3 CSP + `wasm-unsafe-eval` restrictions limit code injection; user education on not sideloading extensions; periodic attestation of extension hash by Android Vault (future enhancement). |
| V6-T13 | **PRF re-auth downgrade to bypass challenge binding** — Attacker forces the system to use Phase 1 PRF-based silent re-authentication (session resumption) instead of challenge-bound WebAuthn, bypassing transaction-specific biometric binding. | Tampering | Medium | PRF re-auth is restricted to session resumption only (re-establishing transport), not transaction authorization; Android Vault rejects PRF-derived keys for PIN decryption — challenge-bound WebAuthn is mandatory for any actuation authorization. |

### 3. USB AOA 2.0 Transport

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T14 | **Malicious USB device impersonating Android vault** — Attacker plugs a rogue USB device (e.g., Raspberry Pi Zero) that responds to AOA 2.0 negotiation and mimics the Android Vault, receiving decrypted payloads intended for the real phone. | Spoofing | Critical | Serial number matching from Phase 0 provisioning; ECDH key exchange authenticates device possession of pre-provisioned key material; Go Host rejects devices with unknown serials or failed ECDH authentication. |
| V6-T15 | **USB bus sniffing and payload replay** — Attacker with physical access taps the USB cable and replays captured AES-256-GCM encrypted payloads to the Android device, causing duplicate transactions. | Replay | High | Monotonic 64-bit sequence numbers per direction; Android Vault rejects any sequence number ≤ highest seen; session rekey triggered on gap or duplicate; sequence counters held in Go Host RAM and Android Vault RAM only (not persisted). |
| V6-T16 | **libusb driver exploit / malicious USB peripheral** — Attacker connects a USB device that exploits a vulnerability in `libusb-1.0` or the OS USB stack (e.g., descriptor parsing bug) to achieve code execution in the Go Native Host process. | Elevation | Critical | Go Host runs with minimal privileges (no admin/root); input validation on all USB descriptors and control transfer responses; fuzz-tested AOA negotiation state machine; use signed WinUSB drivers on Windows; macOS system extension notarized. |
| V6-T17 | **Go Native Host binary tampering on disk** — Attacker replaces the signed Go Native Host binary with a malicious version that logs keys, exfiltrates payloads, or injects commands. | Tampering | Critical | Binary hash verified by extension on startup using hardcoded expected SHA-256; native messaging manifest path is OS-protected (registry on Windows, user Library on macOS, `/etc/opt` on Linux requires root); code signing certificate on Windows/macOS. |
| V6-T18 | **AOA re-enumeration race condition** — During the 1-3 second AOA mode switch, attacker inserts a malicious device that wins the re-enumeration race and is opened by the Go Host instead of the legitimate phone. | Spoofing | High | Go Host waits for specific VID/PID combination (0x18D1/0x2D01) plus serial number match; re-enumeration window is bounded and monitored; if multiple matching devices appear, connection is aborted and user alerted. |
| V6-T19 | **Native Messaging pipe sniffing by local malware** — Malware on the host OS intercepts stdin/stdout between the Chrome extension and Go Native Host, reading plaintext zkTLS proofs and WebAuthn assertions before USB encryption. | Information Disclosure | High | Native Messaging pipe is OS-mediated with same-user access only; data is only a threat if the PC is fully compromised — in which case zkTLS still prevents transaction forgery because Android Vault verifies independently; consider future NaCl encryption over the pipe. |
| V6-T20 | **USB cable disconnect during active PIN2/QES transaction** — Cable disconnect mid-actuation leaves the Smart-ID app in an inconsistent state (partial PIN entered, signing incomplete), potentially causing account lockout or double-spend ambiguity. | Denial of Service | Medium | Transaction state machine in Android Vault tracks progress; on disconnect, Vault cancels the session and generates a signed cancellation proof; WebRTC fallback is attempted for session completion only if cable disconnects before actuation begins; Smart-ID app timeout handles partial PIN cleanup. |

### 4. NDK Enclave

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T21 | **JNI boundary type confusion / buffer overflow** — Malicious or buggy Java layer passes crafted layout bounds or buffer sizes to C++ enclave, triggering stack/heap corruption in `libvault_enclave.so` and potential code execution. | Elevation | Critical | Strict JNI method signatures with bounds checking; `jint` size validation before any array access; use `GetDirectBufferAddress` only with pre-allocated direct ByteBuffers; AddressSanitizer + bounds checking in debug builds; Fuzz-test JNI entrypoints with malformed inputs. |
| V6-T22 | **mlock exhaustion / resource exhaustion** — Attacker repeatedly triggers PIN decryption requests, exhausting the process's `RLIMIT_MEMLOCK` quota and causing subsequent legitimate PIN operations to fail or fall back to unlocked (swappable) memory. | Denial of Service | Medium | `mlock` quota monitoring; pre-allocate and pool a fixed number of locked buffers at startup; graceful degradation: if `mlock` fails, abort the operation rather than proceed with swappable memory; rate limit PIN decryption requests per session. |
| V6-T23 | **Signal handler / exception path skips explicit_bzero** — C++ enclave crashes (SIGSEGV, SIGABRT) or throws uncaught C++ exception after PIN decryption but before `explicit_bzero`, leaving plaintext PIN in locked memory that may survive process restart or be included in core dumps. | Information Disclosure | High | `SA_SIGINFO` signal handlers for all fatal signals that call `explicit_bzero` before re-raising; C++ RAII wrapper that zeros buffer in destructor (runs during stack unwinding); disable core dumps via `prctl(PR_SET_DUMPABLE, 0)` or `setrlimit(RLIMIT_CORE, 0)`; `mlock`'d pages are not swapped but may persist until process exit — zeroing is mandatory. |
| V6-T24 | **Keystore decryption oracle via timing analysis** — Attacker observes microsecond differences in `Cipher.doFinal` execution time through side channels (cache, power, or JNI call latency) to infer PIN digits or Keystore key material. | Information Disclosure | Medium | Constant-time coordinate mapping logic in C++; avoid early-exit on digit value; use `android.hardware.security.keymint` with timing-resistant implementations where available; batch dummy Keystore operations to mask real operation timing. |
| V6-T25 | **Coordinate mapping side-channel leaks PIN length** — The number of returned X/Y coordinate pairs equals the PIN length, leaking whether the user has a 4-digit or 5-digit PIN (PIN2 vs PIN1) to any process observing the JNI return array size. | Information Disclosure | Low | Pad coordinate arrays to a fixed maximum size (e.g., 6 pairs) with dummy coordinates for unused slots; Java Orchestrator extracts only the meaningful prefix based on a separate length indicator passed through a different channel (or pre-known context: PIN1=4, PIN2=5). |
| V6-T26 | **Direct ByteBuffer memory leak via JNI reference** — The Java layer fails to release a JNI local or global reference to the direct ByteBuffer containing decrypted PIN bytes, causing the buffer to persist in native memory beyond the intended lifecycle. | Information Disclosure | Medium | Use `NewDirectByteByteBuffer` with scoped RAII in C++; Java layer explicitly nulls ByteBuffer references immediately after JNI call returns; periodic native memory leak detection via `Debug.getNativeHeapSize()` monitoring. |

### 5. Ghost Actuator

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T27 | **AccessibilityService privilege hijacking** — Malware on the Android device registers a competing AccessibilityService with higher priority, intercepting or suppressing the Ghost Actuator's gestures, or reading the screen content before `FLAG_SECURE` is applied. | Elevation | Critical | Ghost Actuator is the only enabled AccessibilityService by policy; Android Vault monitors for newly enabled a11y services and alerts user; `android:accessibilityFeedbackType="generic"` with explicit event type filters; require user biometric re-auth if unknown a11y service detected. |
| V6-T28 | **PIN grid layout misidentification leads to wrong taps** — Smart-ID app update changes the PIN pad layout, resource IDs, or content descriptions; the `PinGridAnalyzer` extracts incorrect bounds, and the enclave-generated coordinates tap the wrong digits, causing authentication failure or potential account lockout. | Tampering | High | Grid analyzer uses multiple anchoring strategies (resource IDs, content descriptions, relative positioning); version-specific layout database in Android Vault; fallback to WebRTC-based manual interaction if grid confidence < threshold; visual confirmation screenshot (where `FLAG_SECURE` permits) for debug builds. |
| V6-T29 | **Gesture injection detection by Smart-ID app anti-tamper** — Smart-ID app employs heuristic detection (tap timing uniformity, perfect coordinate precision, missing touch pressure) to identify automated input and reject the login or flag the account. | Denial of Service | Medium | Gesture builder adds jitter: random ±15ms per tap duration, ±10ms inter-tap delay; introduce micro-swipe variance (start/end coordinates differ by 1-2 pixels); simulate realistic touch pressure values where API permits; match human typing cadence distribution. |
| V6-T30 | **Coordinate interception via compromised JVM post-enclave** — After the C++ enclave returns anonymous `float[x,y]` coordinates to Java, a root-level malware with JVM heap access reads the coordinate array before `dispatchGesture()` consumes it, enabling reconstruction of tap locations. | Information Disclosure | Medium | Coordinate arrays are not sensitive secrets (they are anonymous spatial data), but combined with known grid layout they reveal PIN digits; mitigate by clearing Java float arrays immediately after gesture dispatch; pass coordinates via `onBind()` IPC with immediate nulling; root compromise at this layer is accepted as reduced risk (see Risk Acceptance). |
| V6-T31 | **Gesture injection on wrong window / app** — Android system shows an overlay, keyboard, or notification shade that intercepts the dispatched gesture, causing the tap to land on an unintended UI element (e.g., "Cancel" button instead of PIN digit). | Tampering | Medium | `FLAG_SECURE` bypass monitor verifies gesture reachability; retry with adjusted coordinates if expected state transition (screen change, dialog dismissal) does not occur within 2 seconds; abort and fallback to manual entry after 3 failed attempts. |

### 6. eIDAS QES Gate

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T32 | **Volume Down event spoofing / injection** — Attacker injects a fake `KEYCODE_VOLUME_DOWN` event via `adb shell input keyevent`, `/dev/input/event*` write, or compromised system process, bypassing the physical hardware requirement. | Tampering | High | KeyEvent listener filters on `KeyEvent.FLAG_FROM_SYSTEM` and rejects synthetic events; require `KeyEvent.getDeviceId()` to match built-in hardware device ID; monitor for ADB enabled and warn user; hardware interrupt gate logs physical device source in audit trail. |
| V6-T33 | **Overlay clickjacking obscures Smart-ID transaction** — Malicious app displays a transparent or deceptive overlay on top of the non-obscuring QES overlay, tricking the user into pressing Volume Down while viewing falsified transaction details. | Tampering | Critical | QES overlay uses `TYPE_APPLICATION_OVERLAY` with `FLAG_NOT_TOUCH_MODAL` and `FLAG_NOT_FOCUSABLE`; it does NOT obscure the Smart-ID app window (by design); user must see Smart-ID's own certified display underneath; Android 12+ `HIDE_OVERLAY_WINDOWS` permission requested; detect and alert on unknown overlays during QES arming. |
| V6-T34 | **Haptic pattern DoS / battery exhaustion** — Attacker spams high-priority QES requests, causing repeated SOS haptic vibration that drains battery or desensitizes the user to the alert pattern (alert fatigue). | Denial of Service | Low | Rate limit QES requests per session (max 1 per 60 seconds); haptic pattern plays once per arming event; if user ignores, session cancels rather than repeating; battery monitoring pauses automation if battery < 15%. |
| V6-T35 | **Audit log tampering on device** — Root-level attacker modifies the cryptographic audit log stored on the Android device to remove evidence of unauthorized QES signatures, enabling successful repudiation. | Repudiation | Medium | Audit log entries are signed with a device-local attestation key held in Android Keystore (`setUserAuthenticationRequired(true)`); tampering breaks the signature chain; log entries are periodically exported to the PC extension and cloud backup; append-only log structure with hash chain linking. |
| V6-T36 | **QES timeout exploitation** — Attacker triggers a PIN2 request, then prevents the user from seeing the phone (e.g., by covering it or distracting them) until the 30-second timeout expires, causing the transaction to cancel and requiring re-initiation. | Denial of Service | Low | 30-second timeout is user-protective; extension popup shows "QES ARMED — verify on phone" with countdown; smartwatch companion app can mirror the alert for glanceable notification; user can extend timeout once per session by pressing Volume Up. |
| V6-T37 | **Non-obscuring overlay abuse by Vault itself** — Bug or malicious update in the Android Vault causes the QES overlay to accidentally obscure the Smart-ID app transaction details, violating eIDAS "physical viewing" requirement and creating legal non-compliance. | Repudiation | Medium | Overlay dimensions and positioning validated against Smart-ID app window bounds using Accessibility node tree; overlay is transparent (alpha 0.3) with text-only; automated screenshot testing in CI verifies no occlusion; compliance audit checklist before each release. |

## Cross-Cutting Threats

| ID | Threat | STRIDE | Severity | Mitigation |
|----|--------|--------|----------|------------|
| V6-T38 | **Supply chain compromise of Go Native Host or Android APK** — Attacker compromises the CI/CD pipeline, GitHub Actions runner, or build machine to inject malicious code into the Go Native Host binary or Android Vault APK distributed to users. | Tampering | Critical | Reproducible builds for Go binary and Android APK; build attestation via Sigstore/cosign; extension verifies binary hash at runtime; APK distributed through Google Play with Play App Signing; separate build and signing environments with HSM-backed signing keys. |
| V6-T39 | **Phase 1 → V6 downgrade attack** — Attacker forces the extension to use Phase 1 WebRTC transport and emoji SAS pairing instead of V6 USB AOA + challenge-bound WebAuthn, bypassing all V6 security enhancements. | Tampering | High | Transport abstraction prefers USB when available; downgrade to WebRTC requires explicit user opt-in per-session; Android Vault rejects Phase 1 protocol messages for PIN2/QES operations; deprecation policy removes Phase 1 code after V6 parity achieved. |
| V6-T40 | **WebRTC fallback downgrade when USB unavailable** — When USB cable is disconnected, the system falls back to WebRTC transport, which lacks hardware proximity guarantees and is vulnerable to the Phase 1 threat model (signaling server trust, TURN relay exposure). | Tampering | Medium | WebRTC fallback is E2EE (DTLS + Noise) same as Phase 1; downgrade is logged and popup shows "USB disconnected — using encrypted cloud fallback"; challenge-bound WebAuthn still applies regardless of transport; PIN2/QES operations can be configured to require USB only (admin policy). |
| V6-T41 | **zkTLS + WebAuthn binding bypass via concurrent transaction** — Attacker initiates two transactions in rapid succession, causing the extension to mix up zkTLS proofs, challenges, or control codes between sessions, resulting in the user biometrically approving Transaction A while the Vault executes Transaction B. | Elevation | High | Strict session isolation: each transaction gets a unique `session_id` and nonce; challenge derivation includes `session_id`; Android Vault maintains a map of pending sessions and rejects out-of-order or mismatched assertions; popup UI shows the exact transaction details before biometric prompt. |
| V6-T42 | **Physical device theft with unlocked vault** — Attacker steals the user's Android phone while it is unlocked and tethered via USB, then initiates unauthorized transactions using the already-authenticated session. | Information Disclosure | High | Android Vault requires biometric re-auth for every PIN2/QES operation (Volume Down is not biometric — it is intent confirmation); PIN1 operations are limited to low-value thresholds; phone lock or USB disconnect immediately invalidates the session; `setUnlockedDeviceRequired(true)` on Keystore keys means lock screen kills decryption capability. |
| V6-T43 | **Multi-device confusion / wrong phone tethered** — User tethers a secondary Android device (e.g., family member's phone) that also runs the Vault app; the Go Host connects to the wrong device and sends attested transactions to an unauthorized vault. | Spoofing | Medium | Phase 0 provisioning binds exactly one device serial number; Go Host rejects unknown serials; popup shows connected device name and serial; user must explicitly authorize new device provisioning, which revokes the old device's passkey. |
| V6-T44 | **Extension-popup UI spoofing / phishing** — Attacker website uses CSS overlays, fullscreen APIs, or browser UI manipulation to create a fake SmartID2 popup that mimics the real extension UI, tricking the user into approving the wrong transaction. | Spoofing | Medium | Extension popup is a genuine Chrome extension UI (not injectable by web content); all transaction-critical UI runs in the extension process with `chrome-extension://` origin; popup displays the attested control code and origin from zkTLS header, not from DOM; user education on verifying the extension icon. |

## Risk Acceptance

The following risks are explicitly accepted as out of scope or mitigated to a residual level deemed acceptable for the V6 threat model:

### RA-01: Root-Compromised Android Device (Post-Actuation Coordinate Exposure)
If the Android device is rooted **and** the attacker can read JVM heap **after** the NDK enclave has returned coordinates but **before** the Java layer clears them, the attacker learns anonymous `float[x,y]` pairs. Combined with knowledge of the PIN grid layout (public information from the Smart-ID app UI), this allows PIN reconstruction. This is accepted because:
- The attack window is milliseconds (between JNI return and array nulling).
- A root-compromised device at this sophistication level could also keylog the touchscreen directly.
- Defense shifts to detection: Vault app includes SafetyNet / Play Integrity API attestation and refuses to operate on rooted devices (configurable policy).

### RA-02: Smart-ID App Anti-Automation Arms Race
The Smart-ID app vendor may deploy heuristic or structural countermeasures against `dispatchGesture()` automation (e.g., randomizing button positions, detecting non-human input patterns). This is accepted because:
- The Ghost Actuator includes jitter, variance, and fallback to manual entry.
- Grid analyzer is designed for rapid adaptation to layout changes.
- The legal and UX benefits of automation outweigh the risk of temporary breakage pending adaptation.

### RA-03: Bank Refusal to Implement `SmartID-Attestation` Header
If one or more whitelisted RPs decline to add the ECDSA-signed response header, the extension degrades to DOM-only mode for those domains. This is accepted because:
- Graceful degradation preserves Phase 1 security level (no regression).
- The 4 initial RPs (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee) are known business partners with contractual motivation to cooperate.
- DOM-only mode still benefits from Challenge-Bound WebAuthn (RAT cannot spoof origin) and USB transport (hardware proximity).

### RA-04: eIDAS Jurisdictional Interpretation Variance
Regulators in different EU member states may interpret "Sole Control" and "physical viewing" differently, potentially ruling that any automation — even with hardware interrupt and cryptographic audit — violates QES requirements. This is accepted because:
- The QES Gate design exceeds current eIDAS technical standards for remote signatures.
- Audit trail provides non-repudiation evidence that surpasses manual PIN entry.
- Legal review is recommended per jurisdiction before deployment; the gate can be disabled via remote config for non-QES use cases.

### RA-05: Go Native Host Binary Size and Distribution
The statically compiled Go binary (~5-10MB) is larger than a C equivalent (~500KB). This is accepted because:
- Cross-compilation reliability and memory safety of Go outweigh binary size concerns.
- Binary is distributed via extension update mechanism (Chrome Web Store) or enterprise MDM.
- Size does not materially impact transport latency or security posture.

---

## Appendix A: STRIDE Severity Definitions

| Severity | Definition | Response Time |
|---|---|---|
| Critical | Complete compromise of a security boundary; direct financial or legal impact; no workaround. | Fix before release; block deployment. |
| High | Significant weakening of a security control; exploitation requires attacker sophistication; partial workaround available. | Fix in current sprint; expedited review. |
| Medium | Limited impact; exploitation requires specific conditions or chained with other bugs; acceptable workaround. | Fix in next sprint; standard review. |
| Low | Minimal impact; theoretical or informational only; no immediate exploit path. | Backlog; address opportunistically. |

## Appendix B: Mapping to V6 Specification Threat Postures

| V6 Spec Threat Posture | Threat IDs | Status |
|---|---|---|
| Local OS RAT (PC) — Mathematically Eliminated | V6-T01, V6-T03, V6-T06, V6-T41 | Mitigated |
| WebAuthn RP Spoofing — Cryptographically Eliminated | V6-T09, V6-T10, V6-T11, V6-T12 | Mitigated |
| Local Port Hijacking — Architecturally Eliminated | V6-T14, V6-T15, V6-T16, V6-T19 | Mitigated |
| Android Memory Dump — Architecturally Eliminated | V6-T21, V6-T23, V6-T25, V6-T26 | Mitigated |
| eIDAS Repudiation — Legally Bulletproof | V6-T32, V6-T33, V6-T35, V6-T37 | Mitigated |
| Push Fatigue / Bombing — Impervious | V6-T42, V6-T43 | Mitigated |
