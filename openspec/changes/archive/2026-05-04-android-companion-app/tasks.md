## Core Implementation (completed in initial scaffolding)

- [x] 1.1 Create Android project with Gradle build system
- [x] 1.2 Add dependencies: org.webrtc:google-webrtc, lazysodium-java, firebase-messaging, cameraX, okhttp3, gson
- [x] 1.3 Configure AndroidManifest with required permissions
- [x] 2.1 Implement SignalingClient.kt (Socket.IO client for SDP/ICE relay)
- [x] 2.2 Implement WebRTCManager.kt (RTCPeerConnection setup, data channel, ICE handling)
- [x] 2.3 Test connectivity against extension's offscreen document
- [x] 3.1 Implement NoiseXXResponder.kt (3-message XX handshake as receiver)
- [x] 3.2 Implement NoiseIKResponder.kt (2-message IK handshake as receiver)
- [x] 3.3 Implement NoiseSession.kt (encrypt/decrypt, sequence management, key rotation)
- [x] 3.4 Run interop test: TS initiator ↔ Java responder produce identical cipher states
- [x] 4.1 Set up Firebase project and configure FCM
- [x] 4.2 Implement FCMReceiver.kt with high-priority push handling
- [x] 4.3 Implement TransientCommandService.kt with 60s lifetime and notification
- [x] 4.4 Implement FCM token exchange during pairing
- [x] 5.1 Implement A11yBridgeClient.kt (OkHttp HTTP client to localhost:7333)
- [x] 5.2 Implement DirectAccessibilityService.kt (fallback AccessibilityService)
- [x] 5.3 Implement AccessibilityProvider interface
- [x] 6.1 Implement QR scanner (CameraX + ML Kit) in MainActivity
- [x] 6.2 Implement SAS confirmation UI (numeric only)
- [x] 6.3 Implement transaction display UI

## 1. Emoji SAS (Phase 1 — Pragmatic Pairing)

- [x] 1.1 Implement `EmojiSasDerivation.kt`: SHA-256 of Noise encryption_key → 18 bits → 3 × 6-bit indices → 64-emoji palette lookup
- [x] 1.2 Update PairingFragment to display 3 emoji at large size with "Yes, Match" / "No, Cancel" buttons
- [x] 1.3 Add accessibility fallback: detect TalkBack → show 6-digit numeric SAS + "Confirm" button
- [x] 1.4 Send `pairing-confirmed` message to extension after user confirms match
- [x] 1.5 Send `pairing-rejected` message to extension if user cancels; abort pairing
- [x] 1.6 Test: verify both sides derive identical emoji SAS from same Noise session key

## 2. Context-Aware Biometric Prompt (Phase 4 — JIT Auth)

- [x] 2.1 Implement `AutoApproveManager.kt`: check `KeyguardManager.isDeviceLocked()` and `PowerManager.isInteractive()`
- [x] 2.2 Implement auto-approve: if unlocked+interactive, decrypt and return credentials silently
- [x] 2.3 Implement lock-screen notification: "Tap fingerprint to log into <domain> on Laptop"
- [x] 2.4 Implement smartwatch approval: Android Wear notification with inline approval action
- [x] 2.5 Add 500ms debounce to `isDeviceLocked()` check to avoid race condition on wake
- [x] 2.6 Include `approval_mode: 'auto' | 'biometric'` in credential response

## 3. Phase 1 Credential Vault (Phase 4 — JIT Auth, website passwords)

- [x] 3.1 Implement `VaultManager.kt`: AES-256-GCM encrypted SQLite database
- [x] 3.2 Generate and store encryption key in Android Keystore (hardware-backed)
- [x] 3.3 Implement `storeCredential(domain, username, password)` — encrypt and insert
- [x] 3.4 Implement `lookupCredential(domain)` — decrypt and return single entry
- [x] 3.5 Implement `deleteCredential(domain)` — remove entry
- [x] 3.6 Handle `credential-request` command: lookup vault, return micro-payload
- [x] 3.7 Handle not-found case: return `{ status: 'not_found' }`

## 3B. V6 Smart-ID PIN Vault (Phase 2 — NDK Enclave)

- [x] 3B.1 Implement `SmartIdPinVault.kt`: AndroidKeyStore `KeyGenParameterSpec` with `setUserAuthenticationRequired(true)` and `setUnlockedDeviceRequired(true)`
- [x] 3B.2 Implement `pinEncrypt(pinBytes, keyAlias)` — encrypt PIN during Phase 0 provisioning using AES/GCM/NoPadding; zero plaintext buffer immediately
- [x] 3B.3 Implement `pinDecryptToBuffer(ciphertext, keyAlias, mlockBuffer)` — decrypt PIN directly into C++ `mlock` buffer via JNI; never store in Kotlin variable
- [x] 3B.4 Implement `hasPin(keyAlias)` — check if PIN has been provisioned for given alias (`smartid_pin1`, `smartid_pin2`)
- [x] 3B.5 Implement `deletePin(keyAlias)` — remove PIN entry from Keystore
- [x] 3B.6 Handle `pin-authorization` command: verify preconditions (zkTLS + WebAuthn passed), authorize enclave, return `float[x,y][]` coordinates (not PIN digits)
- [x] 3B.7 Detect biometric invalidation (user changed/deleted biometric after provisioning) — show error notification "Biometric changed, re-enter Smart-ID PIN"
- [x] 3B.8 Add `android:maxSdkVersion` guard for `setIsStrongBoxBacked(true)` — StrongBox supported on API 28+ with hardware; fall back to TEE-backed on older devices

## 4. PRF Silent Re-Auth (Phase 3 — Dumb Terminal)

- [x] 4.1 Implement `PrfCredentialStore.kt`: store PRF credential ID in EncryptedSharedPreferences
- [x] 4.2 During pairing: receive PRF credential ID from extension, store it
- [x] 4.3 Update `NoiseIKResponder.kt` to accept PRF-derived key as initiator static key
- [x] 4.4 During IK reconnection: look up PRF credential ID, validate handshake
- [x] 4.5 Handle PRF-less fallback: if no PRF credential stored, use PIN-based IK (existing)

## 5. TURN-Capable WebRTC (Phase 2 — Resilient Transport)

- [x] 5.1 Update `WebRTCManager.kt` to fetch TURN credentials from signaling server before RTCPeerConnection creation
- [x] 5.2 Configure ICE servers with relay credentials: `[{ urls: 'stun:...' }, { urls: ['turn:...', 'turns:...'], credential, username }]`
- [x] 5.3 Test connection on home Wi-Fi (local, <5ms)
- [x] 5.4 Test connection behind UDP-blocking firewall (TURN/TCP 443)

## 6. Testing & Integration

- [x] 6.1 Test end-to-end: extension shows QR → phone scans → emoji SAS → Match → paired
- [x] 6.2 Test credential request: extension detects login → sends credential-request → phone auto-approves → vault lookup → micro-payload returned
- [x] 6.3 Test credential request: phone locked → notification → user authenticates → credentials returned
- [x] 6.4 Test PRF re-auth: pair → close → reopen → verify IK handshake with PRF-derived key
- [x] 6.5 Run `bun run lint && bun run typecheck` on extension side
- [x] 6.6 Run interop test suite: TS ↔ Java Noise handshake, encrypt/decrypt, key rotation
