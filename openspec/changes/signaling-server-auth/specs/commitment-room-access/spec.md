## ADDED Requirements

### Requirement: commitment-generation
The extension SHALL compute a commitment when creating a pairing room: `SHA-256(extensionStaticKey || nonce || sasCode)` where `nonce` is 32 CSPRNG bytes.

### Requirement: commitment-in-qr
The QR code payload SHALL include the commitment value alongside the existing `roomId`, `sasCode`, and `nonce`.

### Requirement: phone-proves-commitment
The phone SHALL include the commitment in its `join-room` event. The server SHALL reject the join if the commitment does not match.

### Requirement: server-verification
The signaling server SHALL store room metadata (expected SAS code, nonce, extension static key) when the extension creates the room. The server SHALL verify incoming `join-room` commitment before allowing socket to join the room.

#### Scenario: valid-join-succeeds
- **WHEN** the phone sends the correct commitment for the room
- **THEN** the server SHALL allow the socket to join the room

#### Scenario: invalid-commitment-rejected
- **WHEN** a client sends an incorrect commitment or no commitment
- **THEN** the server SHALL reject the connection with `{ error: 'invalid_commitment' }`

#### Scenario: direct-sas-guess-rejected
- **WHEN** an attacker knows the room ID and SAS code but not the extension static key
- **THEN** the attacker SHALL NOT be able to compute the correct commitment and SHALL be rejected
