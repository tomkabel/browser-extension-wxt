## ADDED Requirements

### Requirement: Noise XX responder handshake

The app SHALL implement the responder side of the Noise XX handshake, matching the extension's initiator.

#### Scenario: Respond to message 1
- **WHEN** the app receives Noise XX message 1 from the extension over the data channel
- **AND** the message follows the protocol framing (version byte 0x00, type byte 0x00, 2-byte length, noise payload)
- **THEN** it SHALL parse the initiator's capabilities JSON from the payload
- **AND** it SHALL create a responder Handshake with its local static keypair
- **AND** it SHALL emit Noise XX message 2 (responder's `e, ee, s, es`) back over the data channel

#### Scenario: Complete XX handshake
- **WHEN** the app receives Noise XX message 3 from the extension
- **THEN** it SHALL call `handshake.readMessage(msg3)` to finalise the handshake
- **AND** it SHALL derive the transport state via `split()`
- **AND** it SHALL compute the 3-emoji SAS from the chaining key via `SHA-256(chainingKey)[0:18 bits] → 3 × 6-bit emoji indices`
- **AND** it SHALL store the Noise session for subsequent message encryption/decryption

#### Scenario: Test vector compliance
- **WHEN** the Noise responder module is tested with official Noise Protocol test vectors for XX pattern
- **THEN** all test vectors SHALL pass for message order, key derivation, and final transport state

### Requirement: Handshake timeout

The responder SHALL enforce a timeout for each handshake message to prevent indefinite blocking.

#### Scenario: Message 1 never arrives
- **WHEN** the data channel opens but no Noise XX message 1 is received within 15 seconds
- **THEN** the responder SHALL discard the handshake state
- **AND** SHALL notify the JS CommandServer via callback that pairing timed out
- **AND** the UI SHALL display "Pairing timed out — please try again"

#### Scenario: Message 3 malformed
- **WHEN** the responder receives Noise XX message 3 that fails `readMessage()` decryption (wrong key, corrupted bytes)
- **THEN** the responder SHALL discard the handshake state
- **AND** SHALL NOT respond with any error message (to avoid leaking crypto state)
- **AND** SHALL notify JS: "Handshake failed — cryptographic mismatch"

### Requirement: Deterministic JNI native module

The Noise responder SHALL be implemented as a thin JNI native module wrapping `noise-java` for deterministic performance.

#### Scenario: createResponderXX returns valid handshake
- **WHEN** JS calls `NoiseResponder.createResponderXX(localStaticKeyBytes)`
- **THEN** the native module SHALL return a handle to the Handshake state
- **AND** the operation SHALL complete in under 50ms

#### Scenario: writeMessage and readMessage round-trip
- **WHEN** JS calls `NoiseResponder.writeMessage(handle, payload1Bytes)` → sends over channel → `NoiseResponder.readMessage(handle, payload2Bytes)`
- **THEN** the functions SHALL correctly produce and consume Noise protocol messages
- **AND** the resulting transport state SHALL be identical to the extension's derived state
