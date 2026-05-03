## ADDED Requirements

### Requirement: RP TLS certificate key management

The extension SHALL maintain a set of trusted RP TLS certificate public keys for zkTLS proof verification on Android.

#### Scenario: Keys bundled with extension

- **WHEN** the extension is installed
- **THEN** it SHALL include a TrustedRpKey manifest for whitelisted RPs (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)
- **AND** each entry SHALL contain: domain, subjectPublicKey (DER-encoded SPKI), notBefore, notAfter, fingerprint (SHA-256 of DER certificate)

#### Scenario: Key refresh from update server

- **WHEN** the extension background script runs
- **AND** a signed key manifest is available from the extension update server
- **THEN** the extension SHALL fetch and verify the manifest signature
- **AND** update the TrustedRpKey store with any new or rotated keys

#### Scenario: Manual key refresh

- **WHEN** the user triggers "Refresh RP keys" in the popup
- **THEN** the extension SHALL immediately fetch the latest signed key manifest
- **AND** display the update result (success/failure) in the popup
