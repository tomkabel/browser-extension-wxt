## Requirements

### Requirement: CSP allows signaling server only

The extension's Content Security Policy SHALL restrict `connect-src` to the signaling server domain only — no wildcards.

#### Scenario: CSP blocks unauthorized hosts

- **WHEN** the extension attempts to connect to any host outside the signaling server domain
- **THEN** the connection SHALL be blocked by CSP
- **AND** a CSP violation report SHALL be generated

### Requirement: Noise property-based tests

The Noise implementation SHALL pass property-based tests for correctness.

#### Scenario: Encrypt/decrypt round-trip

- **WHEN** 1000 random plaintexts are encrypted and decrypted with valid keys
- **THEN** each decrypted output SHALL match the original plaintext

#### Scenario: Wrong key rejection

- **WHEN** ciphertext is decrypted with a different key than was used for encryption
- **THEN** decryption SHALL fail (throw or return null)

### Requirement: Interop between TS and Java implementations

The TypeScript and Java Noise implementations SHALL produce identical cipher states when given the same handshake inputs.

#### Scenario: TypeScript initiator ↔ Java responder

- **WHEN** a TypeScript Noise XX initiator communicates with a Java Noise XX responder
- **THEN** the handshake SHALL complete successfully on both sides
- **AND** both sides SHALL derive identical cipher states (encrypt key, decrypt key, chaining key)
