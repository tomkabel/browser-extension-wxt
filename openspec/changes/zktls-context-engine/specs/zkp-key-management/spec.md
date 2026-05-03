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
- **AND** validate freshness by checking the manifest contains a monotonic version or a signed timestamp+expiry
- **AND** reject manifests with version <= last-seen version per TrustedRpKey, or timestamps outside acceptable clock-skew/expiry
- **AND** persist the last-seen version or timestamp per TrustedRpKey to enforce rollback protection
- **AND** update the TrustedRpKey store with any new or rotated keys only after all checks pass

#### Scenario: Manual key refresh

- **WHEN** the user triggers "Refresh RP keys" in the popup
- **THEN** the extension SHALL immediately fetch the latest signed key manifest
- **AND** verify the manifest signature using the same validation procedures as the background refresh flow
- **AND** reject any manifest whose signature does not verify (do not apply unverified key updates)
- **AND** display the update result (success/failure) in the popup
