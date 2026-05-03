## ADDED Requirements

### Requirement: RP signing key management

The extension SHALL maintain a set of trusted RP signing public keys (ECDSA P-256) for verifying attested control code signatures from whitelisted Smart-ID RPs. These are dedicated signing keys, separate from each bank's TLS certificate key.

#### Scenario: Keys bundled with extension

- **WHEN** the extension is installed
- **THEN** it SHALL include a `TrustedRpSigningKey` manifest for whitelisted RPs (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)
- **AND** each entry SHALL contain: `domain`, `publicKey` (raw ECDSA P-256 public key bytes, uncompressed point format), `keyId` (key identifier for rotation, e.g. `"lhv-2026q2"`), `notBefore` (ISO 8601), `notAfter` (ISO 8601)
- **AND** each key SHALL be a dedicated ECDSA P-256 signing key — NOT the bank's TLS certificate key (TLS keys rotate on different schedules and may be managed by different teams)

#### Scenario: Key refresh from update server

- **WHEN** the extension background script runs
- **AND** a signed key manifest is available from the extension update server
- **THEN** the extension SHALL fetch and verify the manifest signature
- **AND** validate freshness by checking the manifest contains a monotonic version or a signed timestamp+expiry
- **AND** reject manifests with version <= last-seen version per `TrustedRpSigningKey`, or timestamps outside acceptable clock-skew/expiry
- **AND** persist the last-seen version or timestamp per `TrustedRpSigningKey` to enforce rollback protection
- **AND** update the key store with any new or rotated keys only after all checks pass

#### Scenario: Manual key refresh

- **WHEN** the user triggers "Refresh RP keys" in the popup
- **THEN** the extension SHALL immediately fetch the latest signed key manifest
- **AND** verify the manifest signature using the same validation procedures as the background refresh flow
- **AND** reject any manifest whose signature does not verify (do not apply unverified key updates)
- **AND** display the update result (success/failure) in the popup

#### Scenario: Cross-layer verification

- **WHEN** the extension verifies a signed attestation header using `crypto.subtle.verify()` with ECDSA P-256
- **AND** the same attested control code is transported to the Android Vault for WebAuthn challenge binding
- **THEN** the Android Vault SHALL also have access to the same `TrustedRpSigningKey` public keys (bundled in the companion app or delivered via the signed manifest through the transport layer)
