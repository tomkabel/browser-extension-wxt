## 1. Hardware Interrupt Gate State Machine

- [x] 1.1 Implement `HardwareInterruptGate.kt` in Android Vault: state machine with IDLE, ARMED, WAITING, RELEASED, CANCELLED, EXECUTED, COMPLETED states
- [x] 1.2 Implement `arm()` method: triggered by PIN2 detection, transitions from IDLE → ARMED → WAITING, starts SOS haptic, shows overlay, starts 30s timeout
- [x] 1.3 Implement `onKeyEvent()` method: intercepts `KEYCODE_VOLUME_DOWN` in WAITING state → RELEASED; intercepts `KEYCODE_VOLUME_UP` → CANCELLED
- [x] 1.4 Implement `releaseGhostActuator()`: sends intent to GhostActuatorService to execute prepared gesture sequence
- [x] 1.5 Implement timeout: 30s timer, WAITING → CANCELLED on expiry, dismisses overlay, stops haptic
- [x] 1.6 Unit test: state machine transitions correctness (all valid paths)
- [x] 1.7 Unit test: Volume Down ignored in IDLE/ARMED states (not armed yet)
- [x] 1.8 Unit test: timeout causes CANCELLED state and cleanup

## 2. SOS Haptic Pulse

- [x] 2.1 Implement `HapticNotifier.kt`: `VibratorManager`-based SOS pattern (long-short-long, 2-second cycle)
- [x] 2.2 Implement API-level fallback: `VibratorManager` (API 31+) → `Vibrator` (API 26+) → deprecated `vibrate()` (API 26-)
- [x] 2.3 Implement `stopSosHaptic()`: cancels vibration immediately on RELEASED or CANCELLED
- [x] 2.4 Unit test: SOS pattern generates expected vibration waveform (verify timing array)

## 3. Non-Obscuring QES Overlay

- [x] 3.1 Implement `QesOverlayService.kt`: system overlay using `TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_FOCUSABLE`, `FLAG_NOT_TOUCHABLE`
- [x] 3.2 Display overlay at bottom third of screen: shows "QES SIGNATURE ARMED", countdown timer, "Press VOLUME DOWN to authorize", "Press VOLUME UP to cancel"
- [x] 3.3 Implement countdown timer update in overlay (updates every second)
- [x] 3.4 Overlay does NOT obscure Smart-ID app's transaction display area (positioned at bottom third)
- [x] 3.5 Dismiss overlay on RELEASED or CANCELLED or TIMEOUT
- [x] 3.6 Handle overlay permission denial: fall back to notification-based status display
- [x] 3.7 Add `SYSTEM_ALERT_WINDOW` permission to AndroidManifest.xml

## 4. Cryptographic Audit Log

- [x] 4.1 Implement `AuditLogger.kt`: data class `QesAuditEntry` with sessionId, transactionHash, zkTlsProofHash, webauthnAssertionHash, armTimestamp, interruptType, interruptTimestamp, actuationTimestamp, result
- [x] 4.2 Implement attestation key generation during Phase 0 provisioning (Android Keystore, hardware-backed)
- [x] 4.3 Sign audit entries with attestation key using SHA256withECDSA
- [x] 4.4 Store audit log in encrypted storage (EncryptedSharedPreferences or encrypted file)
- [x] 4.5 Implement audit log export for regulatory inspection
- [x] 4.6 Unit test: audit entry serialization/deserialization roundtrip
- [x] 4.7 Unit test: signed entry verification with attestation public key

## 5. Ghost Actuator Integration

- [x] 5.1 Implement HOLD/RELEASE signal: GhostActuatorService receives "hold" signal when PIN2 request is routed through HIG
- [x] 5.2 GhostActuatorService defers gesture execution until HIG sends ACTION_EXECUTE intent
- [x] 5.3 On HIG CANCELLED: GhostActuatorService clears prepared sequence, returns to idle
- [x] 5.4 Add `FOREGROUND_SERVICE` type to AndroidManifest.xml for the gate service

## 6. Browser Extension Popup Updates

- [x] 6.1 Show "QES ARMED — verify on phone" status during the waiting period in popup
- [x] 6.2 On completion, show attested audit trail summary (timestamp, interrupt type, success)
- [x] 6.3 On cancellation/timeout, show "QES cancelled — no signature was created"

## 7. Integration & Testing

- [x] 7.1 Integration test: PIN2 detection → arm → SOS → overlay → Volume Down → actuation
- [x] 7.2 Integration test: timeout → cancellation → audit log entry generated
- [x] 7.3 Integration test: Volume Up cancel → no actuation
- [x] 7.4 Manual QA: verify SOS pattern is distinguishable from normal notifications
- [x] 7.5 Manual QA: verify overlay does not obscure Smart-ID app transaction display
- [x] 7.6 Run `bun run lint && bun run typecheck` on extension side
