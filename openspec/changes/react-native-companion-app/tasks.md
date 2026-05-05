## 1. React Native Project Scaffold

- [x] 1.1 Initialize React Native project with TypeScript template, Hermes engine, and strict tsconfig (`noUncheckedIndexedAccess: true`, `noImplicitReturns: true`)
- [x] 1.2 Install dependencies: `react-native-webrtc`, `socket.io-client`, `react-native-keychain`, `react-native-vision-camera`, `react-native-vision-camera-code-scanner`, `react-native-vector-icons`, `zustand`
- [x] 1.3 Configure Metro, Babel, ProGuard/R8 rules for WebRTC native libs
- [x] 1.4 Set up navigation structure: Stack navigator with Home, Pairing, Vault, Settings screens
- [x] 1.5 Create Zustand store with slices: `pairingState`, `connectionState`, `vaultState`, `transportState`
- [x] 1.6 Create `types/index.ts` mirroring extension types: `NoiseSession`, `ControlCommand`, `ControlResponse`, `CommandType`, `Coordinate`, `ProtocolCapabilities`

## 2. WebRTC Signaling Client

- [x] 2.1 Implement `SignalingClient.ts` — socket.io connection to `VITE_SIGNALING_URL`, room join by SAS code, emit/receive SDP + ICE candidates
- [x] 2.2 Implement `WebRTCService.ts` — `react-native-webrtc` PeerConnection creation, `setRemoteDescription`, `createAnswer`, ICE candidate handling, data channel lifecycle
- [x] 2.3 Wire TURN credential fetch from signaling server `/turn-credentials` endpoint
- [x] 2.4 Implement reconnection with exponential backoff (1s → 30s max) on disconnect
- [x] 2.5 Unit test: signaling server connect/disconnect/reconnect cycle

## 3. Noise Responder Native Module

- [x] 3.1 Add `noise-java` dependency to `vault-android/app/build.gradle.kts` — Maven artifact providing `Noise_25519_ChaChaPoly_BLAKE2s`
- [x] 3.2 Create `NoiseResponderModule.kt` — Android native module exposing 4 JNI bridge functions: `createResponderXX(localStaticKeyBytes): handle`, `writeMessage(handle, payload): response`, `readMessage(handle, payload): response`, `split(handle): {encryptKey, decryptKey, chainingKey}`
- [x] 3.3 Implement `createResponderXX`: instantiate `Handshake` with `Noise_25519_ChaChaPoly_BLAKE2s`, XX pattern, `'responder'` role; store in handle map; return handle ID
- [x] 3.4 Implement `writeMessage`: call `handshake.writeMessage(payload)`, return serialized packet bytes
- [x] 3.5 Implement `readMessage`: call `handshake.readMessage(packet)`, extract `remoteStaticPublicKey` from handshake object, return parsed payload
- [x] 3.6 Implement `split`: call `handshake.split()` after handshake completion, return `{encryptKey, decryptKey, chainingKey}` as byte arrays
- [x] 3.7 Implement emoji SAS derivation in JS (`SHA-256(chainingKey) → 18 bits → 3 emoji indices`) matching `emojiSas.ts` — this runs in JS because it's non-cryptographic (open output, no secret)
- [x] 3.8 Register module in `MainApplication.kt` via `Packages.add()`
- [x] 3.9 Unit test: run official Noise Protocol XX test vectors through the native module; verify all 3 messages produce correct output
- [x] 3.10 Integration test: create extension-side `createXXHandshake()` fixture, run complete XX handshake between extension JS and RN native module; verify identical `split()` output and emoji SAS

#### Spec alignment note
The spec `noise-responder-native-module/spec.md` mandates JSI/JNI native implementation for deterministic performance. This task implements that mandate via JNI + `noise-java`. The `react-native-quick-crypto` approach was explicitly rejected (see design.md D3) because crypto determinism is a correctness requirement, not a performance preference — any polyfill discrepancy would produce non-matching emoji SAS and failed pairing without debuggability.

## 4. Command Server

- [x] 4.1 Implement `NoiseTransport.ts` — frame messages with protocol version + type bytes (matching `pairingCoordinator.ts` framing); **encryption uses plaintext passthrough until Noise AEAD native module is integrated**
- [x] 4.2 Implement `CommandServer.ts` — listen on NoiseTransport, parse JSON `ControlCommand`, dispatch by `CommandType`
- [x] 4.3 Implement `CredentialRequest` handler — look up vault, biometric prompt, return `{ status: 'found', username, password }` or `{ status: 'not_found' }`
- [x] 4.4 Implement `AuthenticateTransaction` handler — decode PIN, call GhostActuator `holdSequence()`, notify user, execute, return `{ status: 'confirmed' }`
- [x] 4.5 Implement `Ping` handler — respond with `{ status: 'pong' }` and matching sequence number
- [x] 4.6 Implement heartbeat monitoring — if no messages received for 30s, re-send `Ping`; if 3 consecutive pings miss, trigger reconnection

## 5. Secure Credential Vault

- [x] 5.1 Implement `KeyVault.ts` — wrap `react-native-keychain` with `Service`-scoped storage per credential type (LHV password, Smart-ID PIN)
- [x] 5.2 Implement biometric auth gate — `react-native-keychain` `accessControl: BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE`
- [ ] 5.3 Implement vault management screen — add/edit/delete credentials with biometric confirmation (**scaffolded only — VaultScreen.tsx uses useState, not KeyVault**)
- [ ] 5.4 Implement PIN encryption with `KeyGenParameterSpec` `setUserAuthenticationRequired(true)` via native module (**native module not implemented — KeyVault.ts uses react-native-keychain only**)

## 6. GhostActuator Bridge (Native Module)

- [x] 6.1 Create `GhostActuatorBridgeModule.kt` — RN Native Module with methods: `holdSequence(coordinates: ReadableArray)`, `executeSequence()`, `clearSequence()`
- [x] 6.2 Implement coordinate serialization — map JS `[{x, y}]` array → `ArrayList<Coordinate>` parcelable
- [x] 6.3 Wire completion/failure events from `GhostActuatorBridge` callbacks to JS via `ReactContext.emitDeviceEvent()` or promise resolution
- [x] 6.4 Register module in `MainApplication.kt`

## 7. Pairing UI Screens

- [ ] 7.1 Implement QR scanner screen — `react-native-vision-camera` with code scanner frame processor plugin (**scaffolded only — camera permission and preview are placeholders**)
- [ ] 7.2 Implement manual SAS entry screen — 6-digit numeric input with validation (**scaffolded only — no signaling connection wired**)
- [ ] 7.3 Implement emoji SAS confirmation screen — display 3 emojis after handshake, "Waiting for browser confirmation" state (**scaffolded only**)
- [ ] 7.4 Implement home screen — connection indicator (green/red), paired device name, quick status, vault entry button (**scaffolded only**)
- [ ] 7.5 Implement pairing error/retry UI — timeout display, retry button, common error messages (**scaffolded only**)

## 8. Foreground Service Module

- [ ] 8.1 Create `ForegroundServiceModule.kt` — Android foreground service with notification channel `smartid-vault-connection` (**scaffolded only — module is empty stub**)
- [ ] 8.2 Implement start/stop lifecycle — auto-start on WebRTC connect, auto-stop on explicit disconnect (**scaffolded only**)
- [ ] 8.3 Ensure JS runtime survives backgrounding — verify incoming Noise messages are processed while app is backgrounded (**untested**)

## 9. PIN Coordinate Calibration

- [x] 9.1 Create `pinCoordinateMap.ts` with hardcoded coordinate profiles for Smart-ID PIN grid (3×3 + 0)
- [x] 9.2 Profile Samsung Galaxy S23, Pixel 8, Pixel 8a — measure Smart-ID app digit button centers in device coordinates
- [x] 9.3 Implement coordinate lookup by device model (`Dimensions.get('window')` + model matching)

## 10. Integration Testing

- [ ] 10.1 End-to-end: launch extension → generate QR → scan QR from RN app → signaling connect → Noise handshake → emoji SAS match → pairing persisted
- [ ] 10.2 End-to-end: navigate to LHV login page → content script detects form → sends `credential-request` → phone receives → vault lookup → biometric → credentials injected
- [ ] 10.3 End-to-end: LHV transaction page → `authenticate_transaction` → phone receives → GhostActuator holds PIN → executes → confirms
- [ ] 10.4 Edge case: connection drops mid-handshake → reconnection with exponential backoff
- [ ] 10.5 Edge case: Smart-ID app foregrounded during GhostActuator injection → package name validation prevents injection into wrong app
- [ ] 10.6 Edge case: GhostActuator fires but Smart-ID app is not foregrounded → `awaitForegroundAndExecute` waits up to 30s, then times out with error
- [ ] 10.7 Edge case: Noise handshake timeout (no message 1 within 15s) → UI shows "Pairing timed out"
- [ ] 10.8 Edge case: biometric auth fails 3 times → returns `biometry_locked_out` to extension
- [ ] 10.9 Edge case: WebRTC data channel > 64KB messages → chunking + reassembly works correctly

## 11. QA & Polish (Buffer — 2 weeks)

- [ ] 11.1 Smart-ID app layout regression test: install latest Smart-ID app version, verify PIN grid coordinates match hardcoded profiles; update profiles if needed
- [ ] 11.2 WebRTC NAT traversal test: test pairing on 3 different networks (home WiFi, corporate firewall with STUN-only, mobile hotspot hotspot); verify TURN fallback works when STUN fails
- [ ] 11.3 Android version compatibility: test on Android 11, 12, 13, 14 (minimum 3 devices)
- [ ] 11.4 Crash reporting: integrate Sentry or similar; test crash upload on force-close
- [ ] 11.5 App size audit: measure APK size with Hermes + ProGuard; reduce if > 30MB
- [ ] 11.6 AccessibilityService enablement flow: fresh install → pair → navigate to Settings → enable → return to app — verify state is preserved
- [ ] 11.7 Notification permission flow (Android 13+): verify the app requests `POST_NOTIFICATIONS` permission, handles denial gracefully
- [ ] 11.8 Battery optimisation whitelist: detect if app is on battery optimisation blacklist; prompt user to whitelist for reliable foreground service

## 12. Store Submission (1 week)

- [ ] 12.1 Generate app icon (1024×1024) and all required Play Store asset sizes
- [ ] 12.2 Write Play Store description (English) covering: pairing flow, supported banks (LHV), Smart-ID compatibility
- [ ] 12.3 Create screenshots: pairing screen, vault screen, connection status, emoji SAS
- [ ] 12.4 Write privacy policy: "No data collected. All credentials stored locally on device in Android Keystore."
- [ ] 12.5 Set up Play Console internal testing track, upload first APK
- [ ] 12.6 Verify internal testing install on 3 physical devices
