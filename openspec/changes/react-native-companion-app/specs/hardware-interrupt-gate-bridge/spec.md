## ADDED Requirements

### Requirement: HIG RN Native Module

The app SHALL expose the existing `HardwareInterruptGate.kt` to React Native via a Native Module.

#### Scenario: Arm HIG from JS
- **WHEN** JS calls `HardwareInterruptModule.arm(sessionId, transactionHash, zkTlsProofHash, webauthnAssertionHash)`
- **THEN** the module SHALL call `HardwareInterruptGate.arm()` with the same parameters
- **AND** the HIG SHALL start the Volume Down/Volume Up listener

#### Scenario: HIG completion callback
- **WHEN** the user presses Volume Down and the GhostActuator executes successfully
- **AND** `HardwareInterruptGate.onGhostActuatorCompleted()` is called
- **THEN** the RN module SHALL emit a `'QES-completed'` event to JS
