## ADDED Requirements

### Requirement: Passkey creation during Phase 0 pairing

The extension SHALL create a WebAuthn passkey during initial device pairing, bound to the extension origin.

#### Scenario: Passkey created

- **GIVEN** the user has confirmed the SAS match during Phase 0 pairing
- **WHEN** the extension calls `navigator.credentials.create()`
- **THEN** the credential SHALL use: ES256 algorithm (-7), platform authenticator, resident key, user verification required
- **AND** the PRF extension SHALL be included: `extensions: { prf: { eval: { first: new Uint8Array(32) } } }`
- **AND** the RP ID SHALL be the extension's origin hostname

#### Scenario: Public key transmitted to Android

- **WHEN** the passkey is successfully created
- **THEN** the extension SHALL transmit the credential ID and public key bytes (raw P-256 coordinates) over the transport channel to the Android Vault
- **AND** the Android Vault SHALL store them in the trust-store

#### Scenario: Passkey creation failure

- **WHEN** passkey creation fails (e.g., platform authenticator unavailable)
- **THEN** the extension SHALL fall back to PRF-only re-authentication (existing flow)
- **AND** SHALL log the failure for diagnostics
