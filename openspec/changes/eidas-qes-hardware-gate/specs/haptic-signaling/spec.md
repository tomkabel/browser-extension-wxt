## ADDED Requirements

### Requirement: SOS haptic pulse

The Android Vault SHALL emit a distinctive SOS haptic pattern when the HIG transitions to WAITING state.

#### Scenario: SOS pulse activated

- **WHEN** the HIG transitions to WAITING state
- **THEN** the Vault SHALL start vibrating with the SOS pattern: three long (500ms), three short (200ms), three long (500ms) with 200ms pauses between each and 1000ms between SOS cycles
- **AND** the pattern SHALL play once (not loop) to avoid user desensitization
- **AND** the pattern SHALL be distinguishable from normal notifications

#### Scenario: SOS pulse stopped

- **WHEN** the HIG transitions to RELEASED, CANCELLED, or COMPLETED
- **THEN** the haptic SHALL be stopped immediately

#### Scenario: API level fallback

- **WHEN** the device API level is below 31 (VibratorManager unavailable)
- **THEN** the Vault SHALL fall back to `Vibrator` class (API 1+) using `VIBRATOR_SERVICE`
- **AND** for API level below 26 (VibrationEffect unavailable), use deprecated `vibrate(long[], int)` pattern
