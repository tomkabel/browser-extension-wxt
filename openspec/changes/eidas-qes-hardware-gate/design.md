## Context

eIDAS Qualified Electronic Signatures (QES) require the user to exercise "Sole Control" over the signature creation device. Under eIDAS Article 26 and CEN/TS 419 241, this means:
1. The user must be able to view the exact transaction data before signing
2. The user must perform a conscious action to authorize the signature
3. The authorization action must be attributable to the user

The challenge for V6 automation: if the Ghost Actuator fills PIN2 automatically, the user might not see the transaction details on the Smart-ID app screen. This breaks "Sole Control."

The Hardware Interrupt Gate (HIG) solves this by introducing a mandatory physical step: after PC biometric verification (WebAuthn) and zkTLS attestation, the Ghost Actuator suspends execution. The phone vibrates with a distinctive SOS pattern. The user must pick up the phone, visually verify the transaction on the Smart-ID app screen, and physically press the Volume Down button. Only then does the Ghost Actuator execute the PIN2 gesture sequence.

## Goals / Non-Goals

**Goals:**
- Hardware Interrupt Gate state machine: IDLE → ARMED → WAITING → RELEASED → EXECUTED → COMPLETED
- KEYCODE_VOLUME_DOWN capture during ARMED/WAITING states
- SOS haptic pulse via VibratorManager (long-short-long pattern, 2-second cycle)
- Non-obscuring system overlay showing QES status + countdown timer
- 30-second timeout with automatic session cancellation
- Cryptographic audit log: session binding, interrupt timestamp, attestation signature
- Integration with Ghost Actuator: actuator receives "hold" signal, released by HIG

**Non-Goals:**
- PIN2 decryption (covered by `ndk-enclave-pin-vault`)
- Gesture execution (covered by `ghost-actuator-gesture-injection`)
- PC-side WebAuthn verification (covered by `challenge-bound-webauthn`)
- Smart-ID app interaction beyond the gate (app handles its own display)

## Decisions

### 1. Hardware Interrupt Gate State Machine

```
┌──────────┐    detect PIN2 request     ┌──────────┐
│  IDLE    │ ──────────────────────────▶ │  ARMED   │
└──────────┘                             └──────────┘
                                              │
                                     send SOS haptic
                                     show overlay
                                              │
                                              ▼
                                         ┌──────────┐
                                         │  WAITING  │ ◀── 30s countdown
                                         └──────────┘
                                        /            \
                          VOLUME_DOWN               TIMEOUT
                              │                        │
                              ▼                        ▼
                       ┌──────────┐             ┌────────────┐
                       │ RELEASED │             │ CANCELLED  │
                       └──────────┘             └────────────┘
                              │
                     Ghost Actuator executes
                              │
                              ▼
                       ┌──────────┐
                       │ EXECUTED │
                       └──────────┘
                              │
                     Log audit trail
                              │
                              ▼
                       ┌──────────┐
                       │COMPLETED │
                       └──────────┘
```

### 2. Volume Down Capture

```kotlin
class HardwareInterruptGate(private val context: Context) {
  enum class State { IDLE, ARMED, WAITING, RELEASED, CANCELLED, EXECUTED, COMPLETED }
  private var state = State.IDLE
  private var armTimestamp: Long = 0
  private var interruptTimestamp: Long = 0

  fun arm() {
    state = State.ARMED
    armTimestamp = System.currentTimeMillis()
    startSosHaptic()
    showQesOverlay()
    state = State.WAITING
    startTimeout(30_000)
  }

  fun onKeyEvent(event: KeyEvent): Boolean {
    if (state != State.WAITING) return false
    if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN && event.action == KeyEvent.ACTION_DOWN) {
      interruptTimestamp = System.currentTimeMillis()
      state = State.RELEASED
      stopSosHaptic()
      dismissQesOverlay()
      releaseGhostActuator()
      return true  // Consume the event (prevent volume change)
    }
    return false
  }

  private fun releaseGhostActuator() {
    // Signal the GhostActuatorService to execute the prepared gesture sequence
    val intent = Intent(GhostActuatorService.ACTION_EXECUTE).apply {
      putExtra("foreground", true)
    }
    ContextCompat.startForegroundService(context, intent)
  }
}
```

### 3. SOS Haptic Pattern

```kotlin
  fun startSosHaptic() {
  // Requires API 31+ (Android 12) for VibratorManager.
  // Fallback path for API 26-30 uses Vibrator via getSystemService(Context.VIBRATOR_SERVICE).
  val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    context.getSystemService(VibratorManager::class.java).defaultVibrator
  } else {
    @Suppress("DEPRECATION")
    context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
  }
  val sosPattern = longArrayOf(
    0,      // start immediately
    500,    // LONG vibration
    200,    // pause
    500,    // LONG vibration
    200,    // pause
    500,    // LONG vibration
    1000,   // long pause (end of SOS cycle)
    200,    // SHORT
    200,    // pause
    200,    // SHORT
    200,    // pause
    200,    // SHORT
    1000,   // long pause
    500,    // LONG vibration
    200,    // pause
    500,    // LONG vibration
    200,    // pause
    500,    // LONG vibration
  )
  // Requires API 26+ (Android 8) for VibrationEffect.
  // Pre-API 26 devices fall back to vibrator.vibrate(pattern, repeat) via compat.
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    vibrator.vibrate(VibrationEffect.createWaveform(sosPattern, -1)) // -1 = play once
  } else {
    @Suppress("DEPRECATION")
    vibrator.vibrate(sosPattern, -1)
  }
}
```

The SOS pattern is designed to be distinguishable from normal notifications even when the phone is face-down on a desk.

### 4. QES Overlay

The overlay is a transparent, non-clickable overlay that shows:

```
┌──────────────────────────────────────┐
│  🔒 QES SIGNATURE ARMED              │
│                                      │
│  View transaction on Smart-ID app    │
│                                      │
│  ⏱ Expires in: 24s                  │
│                                      │
│  Press VOLUME DOWN to authorize      │
│  Press VOLUME UP to cancel          │
└──────────────────────────────────────┘
```

Key properties:
- `TYPE_APPLICATION_OVERLAY` (API level 26+)
- `FLAG_NOT_FOCUSABLE` and `FLAG_NOT_TOUCHABLE` — passes all touch events through
- Semi-transparent background (not fully opaque — user must see the Smart-ID app beneath)
- Positioned at the bottom third of the screen (doesn't cover the Smart-ID app's transaction display area)
- The volume buttons are hardware-based and cannot be intercepted by the overlay

### 5. Cryptographic Audit Log

```kotlin
data class QesAuditEntry(
  val sessionId: String,
  val timestamp: Long,
  val transactionHash: String,      // SHA-256 of transaction details
  val zkTlsProofHash: String,       // SHA-256 of zkTLS proof
  val webauthnAssertionHash: String, // SHA-256 of WebAuthn assertion
  val armTimestamp: Long,
  val interruptType: String,        // "VOLUME_DOWN"
  val interruptTimestamp: Long,
  val actuationTimestamp: Long,
  val result: String,               // "COMPLETED" | "CANCELLED" | "TIMEOUT"
)

// The log entry is signed with a device-local attestation key
val signedEntry = signWithAttestationKey(serialize(auditEntry))
```

The audit log is stored in the Android Vault's encrypted storage and can be exported for regulatory audits. The attestation key is generated during Phase 0 provisioning and backed by Android Keystore (hardware-backed on supported devices).

### 6. Volume UP as Cancel

To provide a cancel option without needing the touchscreen (which may be displaying the Smart-ID app):

- `KEYCODE_VOLUME_UP` during `WAITING` state → transition to `CANCELLED`
- Cancellation generates a distinct audit log entry
- The Ghost Actuator does NOT execute
- The Smart-ID push is allowed to timeout naturally
- The user can retry with a fresh session

## Risks / Trade-offs

- [Risk] API level requirements: `FLAG_APPLICATION_OVERLAY` requires API 26+ (app min is 33, acceptable). `VibratorManager` requires API 31+; design includes API 26+ fallback to `Vibrator`. `VibrationEffect.createWaveform()` requires API 26+; design includes pre-26 fallback
- [Risk] Volume button may be physically broken or inaccessible — Provide a "Cancel QES" button in the overlay that requires fingerprint authentication as alternative
- [Risk] Smart-ID app may not show the full transaction context for all RPs — The legal requirement is that the user MUST be able to view the transaction; skip hardware gate for transactions that the Smart-ID app does display
- [Risk] User might press Volume Down reflexively without reading the Smart-ID screen — The SOS haptic and overlay text are designed to alert the user to LOOK at the phone; the 30-second window provides time to verify
- [Risk] Regulatory auditors may require a dedicated signing device — The Vault phone is a general-purpose device; document that Android Keystore hardware attestation + physical button provides equivalent security to a dedicated token
- [Risk] Race condition: user presses Volume Down while Ghost Actuator is still preparing — The gate waits for actuator readiness before transitioning to WAITING; Volume Down is only accepted in WAITING state
- [Trade-off] 30-second timeout vs user patience — 30 seconds is enough to pick up the phone, read the Smart-ID display, and press Volume Down; 60 seconds risks user frustration
