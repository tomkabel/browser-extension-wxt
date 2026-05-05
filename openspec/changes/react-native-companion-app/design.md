## Context

The extension side of Phase 1 (WebRTC phone-as-vault) is fully built: background service worker with 100+ message handlers, offscreen document with RTCPeerConnection + socket.io signaling, Noise XX initiator with emoji SAS, command client with heartbeat/retry, content script with login detection, and a 4-layer popup UI. What's missing is the phone-side WebRTC client that completes the pairing flow and responds to `CredentialRequest` / `AuthenticateTransaction` commands.

The existing `vault-android/` project contains Phase 2C components (GhostActuatorService, HardwareInterruptGate, AuditLogger, QesOverlayService, HapticNotifier) built ahead of schedule. These are complete Kotlin services but lack a host app — no Activity, no WebRTC, no AOA, no pairing UI.

This design specifies a React Native app that wraps the existing Kotlin services as native modules and provides the missing Phase 1 WebRTC client, command responder, credential vault, and pairing UI.

## Goals / Non-Goals

**Goals:**
- Phone-side WebRTC client that connects to `smartid2-signaling.fly.dev`, joins room by SAS, completes Noise XX handshake as responder, and opens a data channel
- Command server on the Noise transport that handles `CredentialRequest`, `AuthenticateTransaction`, and `Ping`
- Secure credential vault storing LHV username/password and Smart-ID PIN with Android Keystore + biometric auth
- GhostActuator bridge that exposes existing `holdSequence()`/`executeSequence()` to JS for PIN injection
- Pairing UI: QR scanner, manual SAS entry, emoji SAS confirmation, connection status, vault management
- Foreground service to keep WebRTC alive when app backgrounded
- All existing Kotlin code (GhostActuatorService, HIG, AuditLogger, QesOverlay, HapticNotifier) retained and reused as RN Native Modules

**Non-Goals:**
- Not implementing any Phase 2 components: no NDK enclave, no zkTLS, no challenge-bound WebAuthn, no USB AOA
- Not replacing the existing `vault-android/` project structure — RN project lives alongside or augments it
- Not modifying the extension's protocol — the command types, Noise parameters, and message format are already defined and must be matched
- Not implementing ADB-based auto-install — app is installed manually (Play Store / sideload)
- Not building the V6 Ghost Actuator QES flow — the Kotlin services exist but the RN integration for QES (Volume Down gate in JS) is Phase 2C scope

## Decisions

### D1: React Native over pure Kotlin or PWA

| Criterion | PWA | Pure Kotlin | React Native |
|-----------|-----|-------------|--------------|
| AccessibilityService | Impossible | Native | Native Module |
| WebRTC | browser-only WebRTC, no data channel | `org.webrtc.*` library | `react-native-webrtc` (wraps same library) |
| Noise crypto | Web Crypto (not available on mobile) | `noise-java` | `react-native-quick-crypto` JSI polyfill + native module fallback |
| Pairing UI velocity | No native feel | XML/Compose (slow iteration) | JSX + hot reload (fast iteration) |
| Keystore access | Impossible | Direct API | `react-native-keychain` or native module |
| Code reuse with extension | Some JS/CSS | None | TS types, message formats can be shared |
| Build complexity | Zero (no build) | Gradle | Metro + Gradle |

**Decision**: React Native. It provides fast JS iteration for UI/pairing/state while exposing native modules for platform APIs (AccessibilityService, Keystore, WebRTC PeerConnection internals, foreground service). The existing Kotlin services are kept as-is and wrapped.

### D2: Native Module Architecture

```
┌─────────────────────────────────────────────────┐
│  React Native JS Thread                         │
│                                                  │
│  ├─ PairingScreen          ┌──────────────────┐  │
│  ├─ VaultScreen           │ CommandServer.ts  │  │
│  ├─ SettingsScreen         │ └─ Parses Noise   │  │
│  └─ ConnectionIndicator    │    → dispatches   │  │
│                            │    Credential,    │  │
│  ┌──────────────────────┐  │    Transaction,   │  │
│  │ NoiseResponder.ts    │  │    Ping commands  │  │
│  │ └─ NativeModule JSI  │  └────────┬─────────┘  │
│  │    → createResponder │           │            │
│  │    → writeMessage    │           ▼            │
│  │    → readMessage     │  ┌──────────────────┐  │
│  │    → split           │  │ NoiseTransport.ts│  │
│  └──────────────────────┘  │ └─ encrypt/decrypt│  │
│                             │    via session    │  │
│  ┌──────────────────────┐  └────────┬─────────┘  │
│  │ GhostActuatorModule  │           │            │
│  │ └─ NativeModule      │  ┌──────────────────┐  │
│  │    → holdSequence()  │  │  WebRTCTransport │  │
│  │    → executeSequence │  │  └─ webrtc module │  │
│  └──────────────────────┘  │    + socket.io    │  │
│                             └──────────────────┘  │
│  ┌──────────────────────┐                          │
│  │ ForegroundService    │  ┌──────────────────┐   │
│  │ └─ NativeModule      │  │  KeyVault         │   │
│  │    → start/stop      │  │  └─ keychain or   │   │
│  │    → background msg  │  │     native module │   │
│  └──────────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────┘
```

### D3: Noise Crypto Path — Native Module (Mandated)

The Noise XX responder is a security-critical protocol component. Both sides must derive identical transport state deterministically — any polyfill discrepancy will produce non-matching emoji SAS and failed pairing. `salty-crypto` (used by extension) depends on `crypto.subtle` which is not available in React Native Hermes.

**Options considered:**
1. `react-native-quick-crypto` — JSI-backed OpenSSL polyfill. Risk: edge cases in the polyfill layer produce non-deterministic Noise output that doesn't match the extension's `salty-crypto`. Debugging crypto mismatch across a WebRTC data channel is near-impossible.
2. **JNI native module wrapping `noise-java`** — Deterministic, same `Noise_25519_ChaChaPoly_BLAKE2s` algorithm, tested against official Noise test vectors. Tiny surface: only 4 functions needed.
3. Pure JS `tweetnacl-js` + hand-rolled ChaChaPoly + BLAKE2s — Error-prone implementation of non-standard primitives; high risk of subtle byte mismatches.

**Decision**: Build a thin JNI native module (`NoiseResponderModule.kt`) wrapping `noise-java` for the Noise XX responder. This is the only approach that guarantees bit-identical transport state with the extension. The module exposes exactly 4 JNI functions: `createResponderXX`, `writeMessage`, `readMessage`, `split`. No `react-native-quick-crypto` polyfill path is needed or planned — it was rejected because crypto determinism is a correctness requirement, not a performance preference.

### D4: Existing Kotlin Integration (Retention, Not Rewrite)

All existing Kotlin code stays in `vault-android/app/src/main/kotlin/org/smartid/vault/`. Each service gets a corresponding RN Native Module:

| Existing Kotlin | RN Native Module | Exposed Methods |
|---|---|---|
| `GhostActuatorService.kt` | `GhostActuatorModule` | `holdSequence(coordinates)`, `executeSequence()`, `clearSequence()`, event callbacks |
| `HardwareInterruptGate.kt` | `HardwareInterruptModule` | `arm(sessionId, ...)`, `reset()`, `getState()`, onKeyEvent callback |
| `AuditLogger.kt` | `AuditLoggerModule` | `logEntry(entry)`, `exportLog(): string`, `clear()` |
| `HapticNotifier.kt` | `HapticModule` | `startSosPattern()`, `stopPattern()` |

The RN JS code imports these modules and calls them from the CommandServer handlers. For example, the `AuthenticateTransaction` flow:

1. CommandServer receives `authenticate_transaction` from extension → decodes PIN from vault
2. CommandServer calls `GhostActuatorModule.holdSequence(mappedCoordinates)` — sequence is held, NOT executed yet
3. CommandServer sends `{ status: 'pending', approval_mode: 'biometric' }` to extension
4. Extension shows "Waiting for phone authentication..." in popup
5. Phone displays biometric prompt (fingerprint/face) — `react-native-keychain` biometric gate
6. On biometric success, CommandServer calls `GhostActuatorModule.executeSequence()`
7. GhostActuator fires `dispatchGesture()` taps into Smart-ID app
8. On completion, CommandServer sends `{ status: 'confirmed' }` to extension

The `holdSequence()` → biometric gate → `executeSequence()` pattern ensures the user explicitly consents to each PIN injection via biometric. This is distinct from the QES Volume Down gate (Phase 2C) which uses the same `holdSequence()`/`executeSequence()` API but releases on hardware interrupt rather than biometric.

### D5: Pairing Flow Integration

The pairing flow matches the extension's existing protocol exactly:

1. User opens RN app → sees "Scan QR" screen
2. Extension popup generates 6-digit SAS + QR code
3. Phone scans QR → extracts `smartid2-pair://` URL with SAS + nonce + commitment
4. Phone connects to signaling server, joins room `smartid2::<sasCode>`
5. Signaling server relays SDP offer from extension to phone
6. Phone creates RTCPeerConnection answer, data channel opens
7. Extension initiates Noise XX handshake (initiator), phone responds (responder)
8. Handshake completes → both sides derive 3-emoji SAS from chaining key
9. Extension popup shows emoji SAS, phone shows emoji SAS
10. User confirms SAS match on extension popup → pairing persisted
11. Extension opens `auth.html?mode=passkey-create` for WebAuthn passkey provisioning

### D6: Project Layout

```
vault-android-rn/
├── package.json
├── tsconfig.json
├── metro.config.js
├── babel.config.js
├── index.js                    # RN entry point (AppRegistry)
├── App.tsx                     # Root navigator
├── src/
│   ├── screens/
│   │   ├── PairingScreen.tsx   # QR scan, SAS enter, emoji confirm
│   │   ├── VaultScreen.tsx     # Credential/PIN management
│   │   ├── SettingsScreen.tsx  # Server URL, debug, transport prefs
│   │   └── HomeScreen.tsx      # Connection status, quick actions
│   ├── services/
│   │   ├── SignalingClient.ts  # socket.io connection + room management
│   │   ├── WebRTCService.ts    # PeerConnection + data channel lifecycle
│   │   ├── NoiseResponder.ts   # Noise XX responder via native module
│   │   └── CommandServer.ts    # Parse Noise messages, dispatch handlers
│   ├── modules/
│   │   ├── GhostActuator.ts    # RN Native Module wrapper
│   │   ├── KeyVault.ts         # Secure storage wrapper
│   │   ├── ForegroundService.ts
│   │   └── HardwareInterrupt.ts
│   ├── store/
│   │   └── index.ts            # Zustand store (pairing, connection, vault state)
│   ├── types/
│   │   └── index.ts            # NoiseSession, CommandType, Coordinate, etc.
│   └── utils/
│       └── pinCoordinateMap.ts # Device-specific PIN grid → coordinate mapping
├── android/
│   └── app/src/main/
│       ├── kotlin/org/smartid/vault/
│       │   ├── ghost/          # GhostActuatorService.kt (unchanged)
│       │   ├── hig/            # HardwareInterruptGate.kt (unchanged)
│       │   ├── audit/          # AuditLogger.kt (unchanged)
│       │   ├── haptic/         # HapticNotifier.kt (unchanged)
│       │   ├── overlay/        # QesOverlayService.kt (unchanged)
│       │   └── modules/        # NEW: RN Native Modules
│       │       ├── GhostActuatorBridgeModule.kt
│       │       ├── NoiseResponderModule.kt
│       │       └── ForegroundServiceModule.kt
│       ├── AndroidManifest.xml # Adds MainActivity, keeps existing services
│       └── res/
└── __tests__/
    └── ...
```

### D7: Smart-ID Foreground Detection Before GhostActuator Execution

The GhostActuator fires taps at X/Y screen coordinates. If the Smart-ID app is not foregrounded when `executeSequence()` fires, the taps land on whatever UI is visible — potentially a sensitive app like a messaging or banking app. This is both a security and reliability risk.

**The problem in detail:**
1. Extension sends `authenticate_transaction` to phone
2. CommandServer decodes PIN, calls `holdSequence(mappedCoordinates)` — correct
3. CommandServer triggers Smart-ID push notification arrival (Android push)
4. **User must tap the push notification** to bring Smart-ID to foreground
5. Only then can GhostActuator execute

If `executeSequence()` is called at step 2 without waiting for step 4-5, the taps fall on the home screen or current foreground app.

**Solution: Two-phase execution with package name gate**

```
CommandServer receives authenticate_transaction
  → holdSequence(coordinates)           # coordinates prepared
  → send push notification to user      # "Tap to open Smart-ID"
  → start waiting loop:
      → GhostActuatorService.onAccessibilityEvent fires on every window change
      → if event.packageName == 'ee.sk.smartid' AND isHeld:
          → executeSequence()           # NOW fire the taps
          → notify push cancelled
```

**Implementation in the RN Native Module:**
- `GhostActuatorBridgeModule.kt` exposes `awaitForegroundAndExecute(timeoutMs: Long): Promise<Void>`
- This wraps the existing `onAccessibilityEvent()` check in `GhostActuatorService.kt` (lines 27-36)
- The module subscribes to foreground events, and only resolves the promise when `ee.sk.smartid` is detected
- JS calls `awaitForegroundAndExecute(30000)` after `holdSequence()`
- If timeout (Smart-ID never opened), JS calls `clearSequence()` and returns `{ status: 'error', error: 'smartid_not_opened' }` to extension

**Race conditions handled:**
- Smart-ID already foregrounded when `holdSequence()` is called → `awaitForegroundAndExecute` checks immediately, executes without waiting
- User opens wrong app → service checks package whitelist, keeps waiting
- Smart-ID push takes > 30 seconds → timeout clears sequence, extension sees error

### D8: PIN Coordinate Calibration

The Smart-ID app's PIN grid (3×3 + 0) must be mapped to screen coordinates per device. The existing GhostActuatorService does not include a PIN grid analyzer — it receives coordinates externally. Two approaches for Phase 1:

1. **Hardcoded profiles** for common devices (Samsung Galaxy S23, Pixel 8, etc.) — coordinates measured once, stored in `pinCoordinateMap.ts`. Fast but fragile across device res/firmware.
2. **Accessibility node tree analyzer** — walks the Smart-ID app's node tree on first launch to detect button bounds, computes center X/Y dynamically. Handles any resolution but requires the Smart-ID app to be foregrounded during calibration.

**Decision**: Ship with hardcoded profiles for the top 10 Android devices by market share. Add accessibility-based dynamic calibration as a Phase 1.5 enhancement.

## Risks / Trade-offs

- **[Risk] `react-native-quick-crypto` may not support all `salty-crypto` internals** → RESOLVED: This approach was rejected. The Noise module uses `noise-java` via JNI directly, eliminating all polyfill risk.
- **[Risk] socket.io WebSocket on JS thread drops heartbeats** — `socket.io-client` in RN runs the WebSocket on the JS thread via JavaScriptCore/Hermes. If the JS thread blocks on crypto, heavy RN re-render, or garbage collection, the WebSocket heartbeat can miss its send window, triggering unnecessary reconnection. **Mitigation**: (1) Extend the extension-side heartbeat timeout from 3 missed pings (45s) to 6 missed pings (90s) for RN fallback. (2) If persistent issues occur, wrap OkHttp WebSocket in a native module and send events to JS via `DeviceEventEmitter`, keeping the WebSocket off the JS thread entirely.
- **[Risk] WebRTC data channel drops when app backgrounded** → Foreground service native module keeps process alive; Android 13+ foreground service types (`dataSync`) restrict network access; the extension side already has reconnection logic (exponential backoff, TURN credential refresh) which handles the 1-30s reconnect window
- **[Risk] WebRTC data channel drops when app backgrounded** → Foreground service native module keeps process alive; Android 13+ may throttle; the extension side already has reconnection logic (exponential backoff, TURN credential refresh)
- **[Risk] Smart-ID app layout changes break PIN coordinates** → Hardcoded profiles need re-measurement when Smart-ID app updates; dynamic calibration mitigates this but adds complexity
- **[Risk] GhostActuator requires user to enable AccessibilityService in Settings** → The app already has the config XML and service declaration; the pairing screen must guide the user through the accessibility enablement flow the first time
- **[Risk] Maintaining RN + Kotlin dual toolchains** → All native code is pre-existing and stable; new development is primarily JS; the Kotlin native modules are thin wrappers (<100 lines each)

## Resolved Decisions (from Open Questions)

### OQ1: Project Layout → Separate `vault-android-rn/` directory

**Decision**: Create a new `vault-android-rn/` React Native project directory. The existing `vault-android/` remains untouched as a pure Gradle/Kotlin library module. The RN project references `vault-android/` as a Gradle module dependency via `settings.gradle.kts`:

```kotlin
// vault-android-rn/android/settings.gradle.kts
include ':app'
include ':vault-android'  // references ../vault-android/
project(':vault-android').projectDir = file('../vault-android/app')
```

This avoids duplicating the existing Kotlin code while keeping the RN build independent. The existing `GhostActuatorService.kt`, `HardwareInterruptGate.kt` etc. are compiled into an AAR that the RN app consumes.

### OQ2: Noise crypto → JNI native module (no polyfill path)

Rejected `react-native-quick-crypto`. See D3 above. The Noise responder requires **deterministic crypto** — identical byte output must match `salty-crypto` on the extension side. Any polyfill discrepancy produces non-matching emoji SAS. The thin JNI module is the only acceptable approach.

### OQ3: Minimum SDK → minSdk 26 (same as existing)

React Native 0.78+ targets minSdk 24. The existing `vault-android/` targets minSdk 26 for `KeyGenParameterSpec` API availability. **Decision**: Keep minSdk 26. This is compatible with RN 0.78+ and ensures `setUserAuthenticationRequired(true)` works correctly.
