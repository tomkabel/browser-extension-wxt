## MODIFIED Requirements

### Requirement: Noise XX first pairing

The extension and phone SHALL perform a Noise XX handshake for the first pairing, providing mutual identity hiding.

**MODIFICATION**: The remote static public key MUST be correctly extracted from the `Handshake` object after reading message 2 — previously it was erroneously set to a zero-filled 32-byte buffer, nullifying identity binding.

#### Scenario: XX handshake success with correct key extraction

- **WHEN** both peers connect to the signaling server
- **AND** the Noise XX handshake runs over the WebRTC data channel
- **AND** the initiator reads message 2 (responder's `e, ee, s, es` tokens)
- **THEN** the initiator SHALL extract the responder's 32-byte static public key from the `Handshake` object via the library's accessor
- **AND** `remoteStaticPk` SHALL NOT be a zero-filled `new Uint8Array(32)`
- **AND** the extracted key SHALL match the responder's known public key (verified via test vector)

#### Scenario: XX handshake success

- **WHEN** both peers connect to the signaling server
- **AND** the Noise XX handshake runs over the WebRTC data channel
- **THEN** both sides SHALL derive identical `Split()` output (encrypt key, decrypt key, chaining key)
- **AND** the handshake SHALL complete in 3 messages (1.5 round-trips)

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
