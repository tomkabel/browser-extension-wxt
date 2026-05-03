## ADDED Requirements

### Requirement: Hardware Interrupt Gate state machine

The Android Vault SHALL implement a Hardware Interrupt Gate (HIG) state machine that suspends Ghost Actuator execution pending a physical Volume Down button press.

#### Scenario: Gate arms on PIN2 detection

- **GIVEN** the Ghost Actuator has received a PIN2 (signing) gesture sequence from the NDK enclave
- **WHEN** the HIG detects the PIN2 request type
- **THEN** the HIG SHALL transition from IDLE to ARMED
- **AND** SHALL start the SOS haptic pulse and display the QES overlay
- **AND** SHALL transition to WAITING state
- **AND** SHALL start a 30-second timeout timer

#### Scenario: Volume Down releases the gate

- **WHEN** the HIG is in WAITING state
- **AND** `KEYCODE_VOLUME_DOWN` is received with `ACTION_DOWN`
- **THEN** the HIG SHALL transition to RELEASED
- **AND** stop the SOS haptic
- **AND** dismiss the QES overlay
- **AND** send ACTION_EXECUTE intent to the GhostActuatorService

#### Scenario: Volume Up cancels the gate

- **WHEN** the HIG is in WAITING state
- **AND** `KEYCODE_VOLUME_UP` is received with `ACTION_DOWN`
- **THEN** the HIG SHALL transition to CANCELLED
- **AND** abort the gesture sequence
- **AND** generate a cancellation audit log entry

#### Scenario: Timeout cancels the gate

- **WHEN** the HIG is in WAITING state
- **AND** the 30-second timeout expires
- **THEN** the HIG SHALL transition to CANCELLED
- **AND** stop the SOS haptic
- **AND** dismiss the overlay
- **AND** generate a timeout audit log entry

#### Scenario: Non-ARMED keys ignored

- **WHEN** the HIG is in IDLE or COMPLETED state
- **AND** any key event is received
- **THEN** the HIG SHALL return false (do not consume the event)
