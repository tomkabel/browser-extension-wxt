## ADDED Requirements

### Requirement: Android-side challenge recomposition

The Android Vault SHALL recompute the expected SHA-256 challenge after TLS binding proof verification and compare it with the assertion's challenge.

#### Scenario: Challenge verification passes (Tier 1)

- **GIVEN** the Android Vault has received the TLS binding proof (Tier 1: Sec-Fetch payload + content hash), assertion data, and session nonce from the extension
- **WHEN** the `ChallengeVerifier` validates the Sec-Fetch structure and extracts the attested context
- **THEN** the verifier SHALL recompute: `expected_challenge = SHA-256(TLV_serialize(proof, origin, code, nonce))`
- **AND** decode the assertion's `clientDataJSON.challenge` from base64url
- **AND** assert that `actual_challenge === expected_challenge`

#### Scenario: Challenge verification passes (Tier 2)

- **GIVEN** the TLS binding proof includes Token Binding data (tier byte 0x02)
- **WHEN** the verifier validates the Token Binding proof
- **THEN** it SHALL recompute challenge including Tier 1 + Tier 2 proof data
- **AND** enforce that the RP domain appears in the approved Tier 2 list

#### Scenario: Challenge verification passes (Tier 3)

- **GIVEN** the TLS binding proof includes DECO oracle proof (tier byte 0x03)
- **WHEN** the verifier validates the DECO notary signature
- **THEN** it SHALL recompute challenge including all three tiers' proof data

#### Scenario: Challenge mismatch

- **WHEN** the recomputed challenge does not match the decoded assertion challenge
- **THEN** the session SHALL be rejected
- **AND** a security audit event SHALL be logged with tier information

#### Scenario: Insufficient tier

- **WHEN** the RP's minimum tier policy requires Tier 2 but the proof is only Tier 1
- **THEN** the session SHALL be rejected
- **AND** the extension SHALL be notified to upgrade its tier for this RP

### Requirement: Assertion signature verification

The Android Vault SHALL verify the WebAuthn assertion signature using the stored passkey public key.

#### Scenario: Signature verification

- **WHEN** the challenge comparison passes
- **THEN** the verifier SHALL retrieve the passkey public key from the trust-store by `credential_id = assertion.rawId`
- **AND** verify the ECDSA P-256 signature: `SHA256withECDSA` over `authenticatorData || SHA256(clientDataJSON)`
- **AND** if verification passes, authorize the session

#### Scenario: Signature verification fails

- **WHEN** signature verification fails
- **THEN** the session SHALL be rejected
- **AND** a security audit event SHALL be logged with minimal fields only: `hash(credentialId)`, `failureReason`, `timestamp`, and `requestOrSessionId` — raw attestation or assertion material SHALL NOT be included in logs or audit events

### Requirement: Nonce replay prevention

The Android Vault SHALL track session nonces to prevent replay attacks.

#### Scenario: Nonce uniqueness check

- **WHEN** the Android Vault receives a session nonce
- **THEN** it SHALL check that the nonce has not been used in the last 100 sessions (LRU eviction)
- **AND** if reused, SHALL reject the session immediately
