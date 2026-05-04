## ADDED Requirements

### Requirement: canonical-tlv-serialization
The `serializeChallengeComponents()` function SHALL produce a canonical TLV byte sequence: Version(1) || ProofLength(2 BE) || Proof(var) || OriginLength(2 BE) || Origin(var) || ControlCodeLength(1) || ControlCode(4) || SessionNonce(32) || Padding(to 32-byte boundary).

### Requirement: sha-256-challenge-derivation
The `deriveChallenge()` function SHALL return SHA-256 of the serialized TLV bytes.

### Requirement: parse-reconstruction
The `parseChallengeComponents()` function SHALL reconstruct the original `ChallengeComponents` from a serialized byte sequence, throwing on truncation or invalid control code length.

#### Scenario: serialization-roundtrip
- **WHEN** valid `ChallengeDerivationInput` is serialized via `serializeChallengeComponents()` and then parsed via `parseChallengeComponents()`
- **THEN** the original components (proof, origin, controlCode, nonce) SHALL match byte-for-byte

#### Scenario: format-version-integrity
- **WHEN** challenge inputs are identical across two serializations
- **THEN** the output byte arrays SHALL be identical (deterministic padding)

#### Scenario: nonce-changes-challenge
- **WHEN** any byte of the session nonce differs between two otherwise identical inputs
- **THEN** the derived challenge SHALL differ (avalanche effect)

### Requirement: input-validation
- **WHEN** `zkTlsProof` exceeds 4096 bytes
- **THEN** `serializeChallengeComponents()` SHALL throw
- **WHEN** `controlCode` is not exactly 4 ASCII characters
- **THEN** `serializeChallengeComponents()` SHALL throw
- **WHEN** `sessionNonce` is not exactly 32 bytes
- **THEN** `serializeChallengeComponents()` SHALL throw
