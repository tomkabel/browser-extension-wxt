## ADDED Requirements

### Requirement: Noise XX first pairing

The extension and phone SHALL perform a Noise XX handshake for the first pairing, providing mutual identity hiding.

#### Scenario: XX handshake success

- **WHEN** both peers connect to the signaling server
- **AND** the Noise XX handshake runs over the WebRTC data channel
- **THEN** both sides SHALL derive identical `Split()` output (encrypt key, decrypt key, chaining key)
- **AND** the handshake SHALL complete in 3 messages (1.5 round-trips)
- **AND** neither side's static public key SHALL be revealed until message 3

### Requirement: Noise IK reconnection

After the first pairing, the extension SHALL use Noise IK for reconnection with the cached static key.

#### Scenario: IK reconnection success

- **WHEN** the extension reconnects to a previously-paired phone
- **AND** the extension has the phone's cached static public key
- **THEN** the extension SHALL initiate Noise IK (1 round-trip)
- **AND** the handshake SHALL complete in 2 messages

### Requirement: Noise Test Vectors compliance

Both TypeScript and Java Noise implementations SHALL pass the official Noise Protocol test vectors for both XX and IK patterns.

#### Scenario: Test vectors pass

- **WHEN** the official Noise Protocol test vectors for XX and IK are run against both implementations
- **THEN** ALL test vectors SHALL pass (handshake output, cipher state derivation, message ordering)
