## ADDED Requirements

### Requirement: Control code extraction and cross-reference

The extension SHALL extract the attested control code from the signed response header and cross-reference it with the DOM-scraped control code.

#### Scenario: Attested code matches DOM code

- **GIVEN** a valid `SmartID-Attestation` response header has been intercepted and signature-verified
- **WHEN** the extension extracts the attested control code from the header payload
- **AND** the DOM-scraped control code matches it
- **THEN** the verification SHALL pass
- **AND** the attested code SHALL be used as the WebAuthn challenge input

#### Scenario: Attested code differs from DOM code (RAT detection)

- **WHEN** the attested control code differs from the DOM-scraped code
- **THEN** the extension SHALL flag this as a potential RAT attack
- **AND** SHALL display a security warning in the popup
- **AND** SHALL proceed with the attested code (not the DOM code) for maximum security
- **AND** SHALL log the discrepancy for audit (log the salted hash of both codes, never plaintext)

#### Scenario: Attestation header unavailable

- **WHEN** the `SmartID-Attestation` header is not present, or its signature fails to verify, or the RP is not in the whitelist
- **THEN** the extension SHALL fall back to DOM-scraped code only
- **AND** SHALL display "DOM-only verification (no server attestation)" in the popup
