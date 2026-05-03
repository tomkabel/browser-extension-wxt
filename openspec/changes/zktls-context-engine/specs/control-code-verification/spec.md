## ADDED Requirements

### Requirement: Control code extraction and cross-reference

The extension SHALL extract the attested control code from the zkTLS proof and cross-reference it with the DOM-scraped control code.

#### Scenario: Attested code matches DOM code

- **GIVEN** a valid zkTLS proof has been generated
- **WHEN** the extension extracts the attested control code from the proof
- **AND** the DOM-scraped control code matches it
- **THEN** the verification SHALL pass
- **AND** the attested code SHALL be used as the WebAuthn challenge input

#### Scenario: Attested code differs from DOM code (RAT detection)

- **WHEN** the attested control code differs from the DOM-scraped code
- **THEN** the extension SHALL flag this as a potential RAT attack
- **AND** SHALL display a security warning in the popup
- **AND** SHALL proceed with the attested code (not the DOM code) for maximum security
- **AND** SHALL log the discrepancy for audit

#### Scenario: zkTLS proof unavailable

- **WHEN** zkTLS proof generation fails or times out
- **THEN** the extension SHALL fall back to DOM-scraped code only
- **AND** SHALL display "DOM-only verification (no zkTLS)" in the popup
