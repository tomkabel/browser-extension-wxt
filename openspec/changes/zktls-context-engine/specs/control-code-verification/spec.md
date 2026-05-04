## ADDED Requirements

### Requirement: Control code extraction and cross-reference

The extension SHALL extract the control code from the TLS binding proof (any tier) and cross-reference it with the DOM-scraped control code. The attested code SHALL always take precedence over the DOM code.

#### Scenario: Tier 1 — Sec-Fetch only, DOM code used

- **GIVEN** no Tier 2 or Tier 3 binding proof is available
- **WHEN** the extension attempts to extract the authenticated control code
- **THEN** it SHALL use the DOM-scraped control code (no attested source available)
- **AND** SHALL annotate the challenge with `source: 'dom-only'`
- **AND** the Android Vault SHALL accept the challenge at Tier 1 policy

#### Scenario: Tier 2 — Token Binding + Sec-Fetch, DOM code used

- **GIVEN** Token Binding proof succeeded but no signed header is available
- **WHEN** the extension packages the TLS binding proof
- **THEN** the DOM-scraped control code SHALL be used
- **AND** the TLS binding proof SHALL attest that the browser navigated to the page and the TLS session is bound
- **AND** the challenge SHALL be annotated with `source: 'tier2-dom'`

#### Scenario: Tier 3 — Attested code matches DOM code

- **GIVEN** a verified SmartID-Attestation header with control code `4892`
- **AND** the DOM-scraped control code is also `4892`
- **WHEN** the extension cross-references both values
- **THEN** verification result SHALL be `VERIFIED_MATCH`
- **AND** the attested control code `4892` SHALL be used for the WebAuthn challenge
- **AND** the challenge SHALL be annotated with `source: 'tier3-signed'`

#### Scenario: Tier 3 — Attested code differs from DOM code (RAT detection)

- **GIVEN** a verified SmartID-Attestation header with control code `4892`
- **AND** the DOM-scraped control code shows `1234` (RAT-modified)
- **WHEN** the extension cross-references both values
- **THEN** verification result SHALL be `VERIFIED_MISMATCH`
- **AND** the attested control code `4892` SHALL be used for the WebAuthn challenge (NOT the DOM code)
- **AND** the popup SHALL display "RAT Activity Detected" alongside the mismatched values
- **AND** a security event SHALL be logged with both values for forensic analysis

#### Scenario: Tier 3 header unavailable, working Tier 1

- **GIVEN** no SmartID-Attestation header is present
- **WHEN** the extension processes the control code
- **THEN** it SHALL fall back to Tier 1 (Sec-Fetch headers) as the available binding
- **AND** use the DOM-scraped control code
- **AND** SHALL NOT display an error to the user
- **AND** SHALL log "Attestation not available, using DOM code with Tier 1 binding"

#### Scenario: Tier available transition

- **WHEN** the user navigates to a page where Tier 3 was previously unavailable
- **AND** later the bank adds the SmartID-Attestation header
- **THEN** the next page load SHALL automatically detect and use Tier 3
- **AND** no extension update is required
