## ADDED Requirements

### Requirement: axe-core-integration
The Playwright E2E test suite SHALL use `@axe-core/playwright` to run automated accessibility checks on the popup.

### Requirement: panel-specific-a11y-tests
Each panel state SHALL have a corresponding a11y test:
- Unpaired state (PairingPanel with QR + SAS)
- Pairing awaiting handshake
- Paired with active session (AuthPanel)
- Transaction verification (TransactionPanel)
- Credential auto-fill (CredentialPanel: detecting, requesting, filled, error)

### Requirement: violation-threshold
Critical and serious axe-core violations SHALL fail the test. Minor and moderate violations SHALL be warnings only.

#### Scenario: pairing-panel-no-violations
- **WHEN** the popup shows the PairingPanel
- **THEN** axe-core SHALL find zero critical or serious violations
