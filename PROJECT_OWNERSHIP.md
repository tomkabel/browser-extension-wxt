# Project Directory Ownership

This repository contains multiple Android-related directories. Here is their relationship:

## `vault-android/` — Native Android Library (Phase 2C Kotlin Services)

**Status**: Active, committed source code

Contains the pure Kotlin/Gradle Android library with:
- `GhostActuatorService.kt` — AccessibilityService for gesture injection
- `HardwareInterruptGate.kt` — Volume button QES gate
- `AuditLogger.kt` — QES audit trail persistence
- `HapticNotifier.kt` — Haptic feedback patterns
- `QesOverlayService.kt` — Overlay UI for QES
- `ChallengeVerifier.java` — zkTLS challenge verification
- `WebAuthnVerifier.java` — WebAuthn assertion verification
- `CredentialTrustStore.java` — Public key trust store

This is a standalone Gradle project that produces an AAR consumed by `vault-android-rn/`.

## `vault-android-rn/` — React Native Companion App (Phase 1)

**Status**: Active, scaffold + implementation in progress

React Native 0.85+ app that provides:
- WebRTC data channel client (phone-as-vault)
- Noise XX responder (via JNI native module wrapping `noise-java`)
- Command server for credential delivery and transaction authentication
- Pairing UI (QR scanner, emoji SAS)
- GhostActuator bridge (wraps `vault-android/` services as RN Native Modules)

References `vault-android/` as a Gradle module dependency.

## `apps/android/` — Legacy Android Project

**Status**: Deprecated, retained for reference only

The original Android project structure before `vault-android/` was created.
Contains an older `AuditLogger.kt` (`com.smartid.vault.audit` package).
**Do not add new code here.** Use `vault-android/` instead.

## `signaling-server/` — WebSocket Signaling Server

Node.js socket.io server deployed to Fly.io. Not an Android project.

## Build Order

1. `vault-android/` builds independently as a Gradle library
2. `vault-android-rn/` references `vault-android/` via `settings.gradle.kts`
3. The RN app bundles the Kotlin native modules alongside its own RN native modules
