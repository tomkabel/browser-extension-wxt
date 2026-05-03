## ADDED Requirements

### Requirement: ECDH key exchange over AOA control channel

The Go native host and the Android device SHALL perform an ephemeral Elliptic-Curve Diffie-Hellman key exchange over the AOA control channel to establish a shared AES-256 session key.

#### Scenario: Host generates ephemeral keypair

- **WHEN** accessory mode is established and the host is ready to begin encrypted communication
- **THEN** the host SHALL generate an ephemeral X25519 keypair `(host_sk, host_pk)` using `crypto/rand`
- **AND** the host SHALL send `host_pk` (32 bytes) over the AOA control channel to the device

#### Scenario: Host receives device public key

- **WHEN** the host receives `phone_pk` (32 bytes) from the device over the AOA control channel
- **THEN** the host SHALL compute `shared_secret = X25519(host_sk, phone_pk)`
- **AND** derive `session_key = HKDF-SHA256(shared_secret, salt=null, info="smartid-vault-aoa-key-v1", length=32)`
- **AND** zero the ephemeral private key `host_sk` and `shared_secret` from memory after derivation

#### Scenario: Complete key exchange sequence

- **WHEN** the key exchange completes successfully on both sides
- **THEN** both the host and the device SHALL have derived the same 32-byte `session_key`
- **AND** the host SHALL initialize sequence numbers: `host_seq = 0`, `device_seq = 0`
- **AND** the host SHALL send a `"key-exchange-complete"` status message to the extension

#### Scenario: Key exchange timeout

- **WHEN** the host does not receive `phone_pk` within 10 seconds of sending `host_pk`
- **THEN** the host SHALL abort the key exchange
- **AND** close the USB connection
- **AND** report a `"key-exchange-timeout"` error to the extension

### Requirement: Control channel message framing

Key exchange messages over the AOA control channel SHALL use a simple length-prefixed binary framing protocol.

#### Scenario: Send key exchange message

- **WHEN** the host sends a key exchange message over the AOA control channel
- **THEN** the message SHALL be framed as `[type: 1 byte][length: 2 bytes BE][payload: length bytes]`
- **AND** message types SHALL be: `0x01` = host public key, `0x02` = device public key, `0x03` = exchange complete
- **AND** `0xFF` SHALL be reserved for error messages

#### Scenario: Receive and parse key exchange message

- **WHEN** the host receives a key exchange message from the device
- **THEN** it SHALL read the 1-byte type and 2-byte length
- **AND** read `length` bytes of payload
- **AND** dispatch to the appropriate handler based on message type

### Requirement: Session rekey on security events

The host SHALL support session rekeying (new ECDH exchange) when a security event is detected.

#### Scenario: Trigger rekey on sequence gap

- **WHEN** a sequence number gap is detected during inbound payload decryption
- **THEN** the host SHALL immediately trigger a session rekey
- **AND** the rekey SHALL perform a fresh ECDH exchange over the control channel
- **AND** both sequence numbers SHALL be reset to 0 with the new keys
- **AND** the previous session key SHALL be zeroed

#### Scenario: Extension-triggered rekey

- **WHEN** the extension sends a `{ "type": "rekey" }` message via native messaging
- **THEN** the host SHALL perform a fresh ECDH exchange
- **AND** respond with `{ "type": "rekey-result", "success": true/false }`
