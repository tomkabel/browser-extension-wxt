## ADDED Requirements

### Requirement: Device coordinate profiles

The app SHALL ship with hardcoded coordinate profiles mapping Smart-ID PIN digits to screen X/Y positions for common Android devices.

#### Scenario: Coordinate lookup
- **WHEN** the app receives `authenticate_transaction` and needs to inject PIN1
- **AND** the current device model matches a profile in the hardcoded map
- **THEN** it SHALL look up the digit→coordinate mapping for that device model
- **AND** produce an ordered `Coordinate[]` array corresponding to the PIN digits

#### Scenario: Unsupported device
- **WHEN** the device model does not match any profile
- **THEN** the app SHALL return `{ error: 'device_not_calibrated' }`
- **AND** fall back to notifying the user to enter PIN manually
