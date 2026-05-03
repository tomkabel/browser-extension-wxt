## ADDED Requirements

### Requirement: SHA-256 challenge derivation

The extension SHALL derive the WebAuthn challenge as SHA-256 of a canonical TLV serialization of zkTLS proof, origin, control code, and session nonce.

#### Scenario: Challenge derived from valid inputs

- **GIVEN** the extension has received a verified zkTLS proof, detected the transaction origin, extracted the control code, and generated a 32-byte session nonce via CSPRNG
- **WHEN** the extension calls the challenge derivation function
- **THEN** the function SHALL serialize components in this order with fixed-length TLV encoding:
  - Version (1 byte, value 0x01)
  - zkTLS_Proof length (2 bytes, big-endian)
  - zkTLS_Proof bytes (variable, up to 4096)
  - Origin length (2 bytes, big-endian)
  - Origin bytes (UTF-8 URL)
  - Control code length (1 byte, value 0x04)
  - Control code bytes (4 ASCII digits)
  - Session nonce (32 bytes)
  - Padding (zero-filled, to next 32-byte boundary)
- **AND** the function SHALL return `SHA-256(serialized_bytes)`

#### Scenario: Deterministic output

- **WHEN** the function is called twice with identical inputs
- **THEN** both outputs SHALL be identical byte arrays

#### Scenario: Different nonce produces different challenge

- **WHEN** the function is called with identical zkTLS proof, origin, and control code but different session nonces
- **THEN** the outputs SHALL differ

### Requirement: Session nonce generation

The extension SHALL generate a cryptographically random 32-byte nonce per authentication session.

#### Scenario: Nonce generation

- **WHEN** a new authentication session starts
- **THEN** the extension SHALL generate a 32-byte nonce using `crypto.getRandomValues()`
- **AND** include it in the zkTLS proof metadata transmitted to the Android Vault
