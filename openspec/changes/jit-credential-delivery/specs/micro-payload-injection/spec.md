## ADDED Requirements

### Requirement: DOM credential injection

The extension SHALL automatically inject received credentials into the detected login form fields via the DOM API immediately upon receiving the micro-payload response. No popup interaction is required for injection.

#### Scenario: Credential auto-fill without manual trigger

- **WHEN** the extension receives a credential response with username and password
- **THEN** the extension SHALL immediately locate the username field by the stored `usernameSelector`
- **AND** set `usernameField.value = username`
- **AND** locate the password field by the stored `passwordSelector`
- **AND** set `passwordField.value = password`
- **AND** dispatch `input` and `change` events on both fields to trigger framework reactivity
- **AND** the popup SHALL update its status display to "Credentials filled" — no button was required

#### Scenario: Field not found on page

- **WHEN** the stored selector no longer matches any element (page changed)
- **THEN** the extension SHALL display "Login form changed. Please reload the page and try again."
- **AND** SHALL NOT inject credentials into random fields

### Requirement: Immediate plaintext garbage collection

The extension SHALL zero the credential plaintext buffer and release all references immediately after injection.

#### Scenario: Buffer zeroed after injection

- **WHEN** credentials are successfully injected into the DOM
- **THEN** the decrypted `Uint8Array` buffer SHALL be filled with zeros via `buffer.fill(0)`
- **AND** all JavaScript string variables holding the password SHALL be set to empty string
- **AND** the variables SHALL be allowed to go out of scope for garbage collection

#### Scenario: No credential persistence

- **WHEN** credentials are injected and zeroed
- **THEN** `chrome.storage.session` SHALL NOT contain the plaintext password
- **AND** `chrome.storage.local` SHALL NOT contain the plaintext password
- **AND** no serialized form of the password SHALL exist after injection
