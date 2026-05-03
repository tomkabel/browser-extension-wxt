## ADDED Requirements

### Requirement: Cryptographic QES audit log

The Android Vault SHALL generate a signed audit log entry for every QES session.

#### Scenario: Audit entry created on completion

- **GIVEN** a QES session completes (EXECUTED → COMPLETED)
- **WHEN** the HIG transitions to COMPLETED
- **THEN** an audit entry SHALL be created containing: sessionId, timestamp, transactionHash, zkTlsProofHash, webauthnAssertionHash, armTimestamp, interruptType ("VOLUME_DOWN"), interruptTimestamp, actuationTimestamp, result ("COMPLETED")
- **AND** the entry SHALL be signed with a device-local attestation key (Android Keystore, hardware-backed)
- **AND** stored in encrypted storage

#### Scenario: Audit entry created on cancellation

- **WHEN** a QES session is cancelled (CANCELLED via Volume Up)
- **THEN** an audit entry SHALL be created with result "CANCELLED"
- **AND** SHALL include the cancellation trigger type

#### Scenario: Audit entry created on timeout

- **WHEN** a QES session times out after 30 seconds
- **THEN** an audit entry SHALL be created with result "TIMEOUT"
- **AND** SHALL NOT include actuationTimestamp or interruptTimestamp

#### Scenario: Attestation key provisioned

- **WHEN** Phase 0 provisioning completes
- **THEN** an attestation key pair SHALL be generated in Android Keystore
- **AND** SHALL be hardware-backed on supported devices (`setIsStrongBoxBacked(true)`)
- **AND** the public key SHALL be exportable for regulatory audit verification
