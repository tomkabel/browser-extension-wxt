## Why

ARCHITECTURE.md specifies an "Android Vault PWA" for Phase 2A, but the actual requirements — WebRTC data channel, Noise XX crypto, NDK memory-locked enclave, AccessibilityService dispatchGesture — all demand native Android code that a PWA cannot provide. The existing `vault-android/` project (GhostActuatorService, HardwareInterruptGate, AuditLogger, QesOverlayService) confirms this: all are Kotlin native services.

A React Native app is the pragmatic middle ground: it provides a JavaScript development surface for rapid UI iteration (pairing screens, credential management, settings) while exposing native Kotlin modules for platform APIs that RN cannot reach (AccessibilityService, Android Keystore, USB AOA, WebRTC PeerConnection via `react-native-webrtc`). The existing Kotlin code is wrapped as Native Modules rather than rewritten.

Without this change, Phase 1 has no phone-side WebRTC client, so the complete pairing flow — QR scan → signaling → Noise handshake → credential delivery — cannot be tested end-to-end. The extension side is fully built; the phone side is missing.

## What Changes

- **New React Native project** at `vault-android-rn/` (or converted from existing `vault-android/`) providing the Phase 1 Android companion app
- **WebRTC data channel client** via `react-native-webrtc` for signaling server connectivity
- **Noise XX responder** as a native module (wrapping `noise-java` or `salty-crypto` via JSI) for E2EE transport
- **Command server** — listens on Noise transport for `CredentialRequest`, `AuthenticateTransaction`, `Ping` commands and dispatches responses
- **Secure credential vault** — wraps Android Keystore via `react-native-keychain` for encrypted storage of LHV credentials and Smart-ID PIN
- **GhostActuator Native Module** — exposes existing `GhostActuatorService.kt` `holdSequence()`/`executeSequence()` to JS for PIN injection
- **Pairing UI** — QR scanner (or manual SAS entry), emoji SAS confirmation, connection status, credential/PIN management screens
- **Foreground service native module** — keeps WebRTC data channel alive when app is backgrounded
- **Existing Kotlin code retained** — GhostActuatorService, HardwareInterruptGate, AuditLogger, QesOverlayService, HapticNotifier remain as native Kotlin, exposed as RN Native Modules

## Capabilities

### New Capabilities
- `react-native-scaffold`: React Native project structure, Metro bundler config, TypeScript strict mode, navigation, Zustand state management, dependency management
- `webrtc-signaling-client`: WebSocket socket.io client connecting to `smartid2-signaling.fly.dev`; room join by SAS code; SDP offer/answer exchange; ICE trickling; data channel lifecycle
- `noise-responder-native-module`: Android native module wrapping `noise-java` or `salty-crypto`/`react-native-quick-crypto` for the Noise XX responder handshake; ingress message 1 → emit message 2 → receive message 3 → derive transport state + emoji SAS
- `command-server-responder`: JS-side listener on Noise transport that parses `CommandType` JSON, dispatches handlers for `CredentialRequest` (returns stored creds), `AuthenticateTransaction` (triggers GhostActuator PIN injection), `Ping` (responds pong)
- `secure-credential-vault`: Two-layer architecture. Layer 1 (Phase 1): `react-native-keychain` with `accessControl: BIOMETRY_CURRENT_SET` for LHV username/password. Layer 2 (Phase 1, upgradeable to Phase 2A): Smart-ID PIN stored via native `KeyGenParameterSpec` with `setUserAuthenticationRequired(true)` AND `setUserAuthenticationValidityDurationSeconds(0)` — this ensures biometric auth is required for every PIN decryption, with zero grace window. The `react-native-keychain` API surface is used for credential storage; the PIN-specific KeyGenParameterSpec is handled through a thin native module to control auth timeout duration explicitly
- `ghost-actuator-bridge`: React Native Turbo Module wrapping existing `GhostActuatorService.kt`; exposes `holdSequence(coordinates: Coordinate[])` and `executeSequence()` to JS; maps RN `Coordinate` → Parcelable `Coordinate`
- `pairing-ui-screens`: QR scanner screen (via `react-native-camera`), manual SAS entry, emoji SAS confirmation display, pairing status/error, device name entry
- `foreground-service-module`: Android foreground service native module keeping WebRTC connection alive when app backgrounded; notification channel; lifecycle management
- `pin-coordinate-calibration`: Device-adaptive Smart-ID PIN grid coordinate mapper; measures screen size/DPI and maps digit → X/Y using Smart-ID app's known grid geometry
- `hardware-interrupt-gate-bridge`: RN Turbo Module wrapping existing `HardwareInterruptGate.kt`; exposes arm/disarm/callbacks for Volume Down QES flow
- `audit-logger-module`: RN Turbo Module wrapping existing `AuditLogger.kt`; exposes `logEntry()`, `exportAuditLog()`, `clear()` to JS

### Modified Capabilities
- `jit-credential-delivery`: Android-side credential storage and `CredentialRequest` handling moves from Kotlin-native to RN-native-module-backed; the command protocol (credential-request/credential-response) and Noise channel remain unchanged
- `ghost-actuator-gesture-injection`: Original spec assumed pure Kotlin invocation path; now gains an RN bridge layer that JS calls to trigger gesture sequences; the `GhostActuatorService.kt` implementation is unchanged
- `ndk-enclave-pin-vault`: Enclave coordinate output must be deliverable through RN Native Module (JNI → JSI) so the GhostActuator bridge can consume it
- `vault6-migration-strategy`: Phase 2A Android app component changes from "PWA" to "React Native app"

## Impact

- **New directory**: `vault-android-rn/` — React Native project (or `vault-android/` converted to RN)
- **Existing `vault-android/` Kotlin code**: Retained in-place; Native Modules added alongside; GhostActuatorService, HardwareInterruptGate, AuditLogger, QesOverlayService, HapticNotifier are unchanged
- **AndroidManifest.xml**: Retains existing service declarations; adds Activity for RN app entry point
- **`build.gradle.kts`**: Updated to add React Native dependencies; existing `androidx.core:core-ktx` and `androidx.security:security-crypto` retained
- **Extension side**: No changes — the extension already sends commands that the RN app will respond to
- **Signaling server**: No changes — existing socket.io protocol already handles any WebRTC client
- **GhostActuator AOA device detection**: The `ghost_actuator_config.xml` accessibility config currently scoped to `ee.sk.smartid` only; unchanged

## V6 Alignment

PHASE 1 — This change implements the Phase 1 Android companion app as React Native. It is V6-compatible: the WebRTC data channel transport becomes the fallback in V6 (USB AOA primary). The GhostActuator, HIG, and AuditLogger native modules are directly reusable in V6. The RN UI layer (pairing, credential management) is replaced by the V6 overlay/QES workflow in Phase 2C but the native modules survive.

## Dependencies

- Builds on: `jit-credential-delivery` (defines credential request protocol that this app implements on the phone side)
- Builds on: `webrtc-datachannel-reliability` (defines the data channel parameters this app connects to)
- Builds on: `vault6-migration-strategy` (defines the phase sequencing this change fits into)
- Related: `ghost-actuator-gesture-injection` (defines the Kotlin service this change bridges to RN)
- Related: `ndk-enclave-pin-vault` (future — this app will consume enclave coordinate output via RN bridge)
- Related: `eidas-qes-hardware-gate` (future — this app's HIG bridge will be used for QES flows)
