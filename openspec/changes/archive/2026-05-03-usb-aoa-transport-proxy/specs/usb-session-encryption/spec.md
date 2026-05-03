## ADDED Requirements

### Requirement: AES-256-GCM payload encryption

All payloads sent over the USB bulk endpoints SHALL be encrypted using AES-256-GCM with monotonic sequence numbers for replay protection.

#### Scenario: Encrypt outbound payload

- **WHEN** a payload is ready to be sent over USB (host → device direction)
- **THEN** the host SHALL construct a 12-byte IV derived from: first 4 bytes = direction tag `0x00` (host-to-device), next 8 bytes = current sequence number (big-endian)
- **AND** encrypt the plaintext with AES-256-GCM using the session key and IV
- **AND** produce the wire format: `[sequence_number: 8 bytes BE][ciphertext: variable][auth_tag: 16 bytes]`
- **AND** increment the outbound sequence number by 1

#### Scenario: Decrypt inbound payload

- **WHEN** a payload is read from USB (device → host direction)
- **THEN** the host SHALL extract the sequence number from the first 8 bytes
- **AND** verify the sequence number equals the expected inbound sequence number
- **AND** construct a 12-byte IV: `0x01` (device-to-host) + sequence number (8 bytes BE)
- **AND** decrypt the ciphertext (bytes 8 through len-16) with AES-256-GCM using session key and IV
- **AND** verify the authentication tag matches the last 16 bytes
- **AND** increment the expected inbound sequence number by 1

#### Scenario: Payload truncation is at most 64KB

- **WHEN** encrypting a payload
- **THEN** the total wire format size (plaintext + 8-byte sequence + 16-byte tag + GCM overhead) SHALL NOT exceed `65536` bytes
- **AND** payloads exceeding this SHALL be fragmented before encryption (up to the transport layer to manage)

### Requirement: Sequence number replay protection

Monotonic, per-direction sequence numbers SHALL prevent replay attacks on the USB transport.

#### Scenario: Accept valid sequence number

- **WHEN** a received sequence number equals the expected sequence number
- **THEN** the payload SHALL be accepted and decrypted

#### Scenario: Reject replayed sequence number

- **WHEN** a received sequence number is less than or equal to the expected sequence number (minus a window of 5 for reordering tolerance)
- **THEN** the payload SHALL be discarded
- **AND** a `'replay-detected'` error SHALL be logged
- **AND** the event SHALL be reported to the extension

#### Scenario: Handle sequence gap (missing sequence)

- **WHEN** a received sequence number is greater than the expected sequence number (more than 1 ahead)
- **THEN** the session SHALL be considered compromised
- **AND** the host SHALL trigger a session rekey (new ECDH exchange)
- **AND** discard the received payload

### Requirement: Key lifecycle — memory-only, zero on teardown

The session encryption key SHALL exist only in memory and SHALL be securely zeroed on session teardown.

#### Scenario: Session key held in memory only

- **WHEN** the session key is derived from the ECDH key exchange
- **THEN** the key SHALL be stored in a `[32]byte` in heap memory
- **AND** the key SHALL NOT be written to disk, swap, or any persistent storage
- **AND** the key memory SHALL be locked from swapping via `mlock()` where available

#### Scenario: Key zeroed on session teardown

- **WHEN** the USB session is disconnected or the native host terminates
- **THEN** the session key memory SHALL be overwritten with zeros (`crypto/subtle.ConstantTimeCopy` or equivalent)
- **AND** any derived key material (IV generator, auth tag buffer) SHALL also be zeroed

### Requirement: Per-session key uniqueness

Each USB session SHALL use a unique encryption key established via fresh ECDH exchange.

#### Scenario: New session = new keys

- **WHEN** a new USB connection is established (including after disconnect/reconnect)
- **THEN** a fresh ECDH key exchange SHALL be performed
- **AND** a new session key SHALL be derived
- **AND** both sequence numbers SHALL be reset to 0
- **AND** the previous session key SHALL be zeroed before the new one is created
