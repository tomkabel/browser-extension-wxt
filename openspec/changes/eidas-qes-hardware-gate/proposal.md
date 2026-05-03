## Why

eIDAS Qualified Electronic Signatures (QES) require the user to maintain "Sole Control" of the signature creation device and physically view the transaction context prior to signing. Standard automation violates this — the Ghost Actuator could sign without the user ever looking at the phone. V6's eIDAS QES Gate solves this by introducing a mandatory hardware interrupt: the Ghost Actuator suspends execution and requires the user to physically press the Volume Down button on the phone after visually verifying the transaction details on the Smart-ID app screen.

This transforms the automated flow from "the proxy signed without my knowledge" to "I physically verified and authorized the signature with a hardware gesture." The audit trail includes:
1. PC biometric verification (WebAuthn)
2. zkTLS proof of transaction context
3. Physical Volume Down press event on the certified device
4. Timestamp of all three events

This makes repudiation claims ("I did not authorize this") legally unsustainable.

## What Changes

- **Hardware Interrupt Gate (HIG)**: State machine in the Android Orchestrator that:
  - Suspends Ghost Actuator execution upon detecting a PIN2 (signing) request
  - Transitions to `ARMED` state, awaiting hardware interrupt
  - On `KEYCODE_VOLUME_DOWN`, releases the actuator to execute the gesture sequence
  - On timeout (30s), transitions to `CANCELLED` and aborts the session
- **SOS Haptic Pulse**: `VibratorManager.vibrate()` with a distinctive long-short-long pattern that signals "Action required" without screen glance
- **Non-Obscuring Overlay**: Transparent, non-clickable overlay that shows: "QES ARMED. Verify amount on Smart-ID app. Press VOLUME DOWN to sign." This overlay does NOT obscure the Smart-ID app window (user must see the app's own display).
- **KeyEvent Listener**: `onKeyDown()` handler in the Orchestrator that catches `KEYCODE_VOLUME_DOWN` specifically when in `ARMED` state. Volume Down does NOT change volume during signing — it's captured by the listener.
- **Cryptographic Audit Log**: The orchestrator logs:
  - `session_id`, `zkTLS_proof_hash`, `webauthn_assertion_hash`
  - `hardware_interrupt_type: "VOLUME_DOWN"`
  - `interrupt_timestamp`, `actuation_timestamp`
  - Signed with a device-local attestation key for non-repudiation
- **Suspension Timeout UI**: The overlay shows a countdown timer. If the user doesn't press Volume Down within 30 seconds, the session is cancelled and a cancellation proof is generated.

## Capabilities

### New Capabilities

- `hardware-interrupt-gate`: State machine for suspending ghost actuation pending physical Volume Down press; ARM → WAITING → RELEASED → EXECUTED lifecycle
- `non-obscuring-overlay-display`: Transient system overlay for QES instructions that doesn't obscure the Smart-ID app's transaction display
- `haptic-signaling`: `VibratorManager`-based SOS pattern for silent, glance-free user notification
- `qes-audit-trail`: Cryptographic log of all QES events with session binding and device attestation signing
- `hardware-interrupt-capture`: `KEYCODE_VOLUME_DOWN` interception during ARMED state, with exclusive access prevention for other listeners

### Modified Capabilities

- Existing `ghost-actuator-gesture-injection`: Gains a QES mode where execution is deferred until hardware interrupt
- `transaction-flow`: PIN2 (QES) requests are routed through the Hardware Interrupt Gate instead of executing immediately

## Impact

- **Android Vault app**: `HardwareInterruptGate.kt` — state machine. `QesOverlayService.kt` — system overlay. `AuditLogger.kt` — cryptographic audit trail. `HapticNotifier.kt` — vibrator patterns.
- **AndroidManifest.xml**: `SYSTEM_ALERT_WINDOW` permission for overlay. `FOREGROUND_SERVICE` for the gate service. `VIBRATE` permission.
- **Browser Extension**: Popup shows "QES ARMED — verify on phone" status during the waiting period. After completion, shows attested audit trail.
- **Smart-ID app interaction**: User sees the exact transaction details (amount, beneficiary) on the Smart-ID app screen (which appeared from the Smart-ID Vault's push). This is the certified eIDAS display.
- **Legal compliance**: The combination of zkTLS (network truth) + WebAuthn (PC biometric) + Volume Down (hardware interrupt) creates an audit trail exceeding current eIDAS requirements for remote QES.

## V6 Alignment

PHASE 2 — This is the eIDAS compliance layer that makes V6 legally bulletproof. It is the final layer of defense in the V6 threat model (see Threat Model: "eIDAS Repudiation → Legally Bulletproof"). Required for PIN2 automation in regulated environments. Without this gate, the Vault cannot legally perform automated QES.

## Dependencies

- Blocked on: `ghost-actuator-gesture-injection` (gate suspends and releases the actuator), `ndk-enclave-pin-vault` (enclave decrypts PIN2 which the actuator will input)
- Related: `challenge-bound-webauthn` (PC biometric verification must succeed before the gate arms)
