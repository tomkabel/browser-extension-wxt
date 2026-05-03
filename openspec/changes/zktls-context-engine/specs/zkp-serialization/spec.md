## ADDED Requirements

### Requirement: Compact ZKP serialization

The extension SHALL serialize the zkTLS proof into a compact binary format (<4KB) for efficient transport.

#### Scenario: Proof serialized for transport

- **WHEN** a zkTLS proof is generated
- **THEN** the proof SHALL be serialized into a compact binary format including: TLS session fingerprint, transcript position, attested control code, Notary's attestation signature
- **AND** the total serialized size SHALL be <4KB

#### Scenario: Deserialization on Android

- **WHEN** the Android Vault receives the serialized proof
- **THEN** it SHALL deserialize the proof using the corresponding binary format
- **AND** SHALL NOT allocate more memory than the serialized payload size
