## ADDED Requirements

### Requirement: E2E tests load the extension

All E2E test suites SHALL create a Chromium context with the extension loaded via `--load-extension`.

#### Scenario: Extension loaded in test context

- **WHEN** a test suite runs in `beforeAll`
- **THEN** the browser context SHALL be created with `args: ['--disable-extensions-except=<path>', '--load-extension=<path>']`
- **AND** the extension ID SHALL be resolved from the manifest for extension page access

### Requirement: E2E tests verify extension behavior

E2E tests SHALL verify extension-specific behavior, not just page DOM content.

#### Scenario: Content script sends domain change message

- **WHEN** the test navigates to a page matching the content script's `matches` pattern
- **THEN** the test SHALL verify that the background received a `tab-domain-changed` message

#### Scenario: Popup renders panel components

- **WHEN** the test opens `chrome-extension://<id>/popup.html`
- **THEN** the test SHALL verify the PairingPanel or AuthPanel is rendered

### Requirement: E2E tests have no false-positive skips

Test suites SHALL NOT wrap extension-specific assertions in try/catch that silently skip on failure.

#### Scenario: Failing test reports actual failure

- **WHEN** an extension-specific assertion fails
- **THEN** the test SHALL fail with the actual error
- **AND** SHALL NOT be caught and skipped
- **AND** `test.skip()` SHALL only be used for the pre-build check in `beforeAll`
