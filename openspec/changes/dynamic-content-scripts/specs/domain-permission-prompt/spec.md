## ADDED Requirements

### Requirement: unapproved-domain-detection
- **WHEN** the content script detects a login form on a domain NOT in the approved list AND NOT in the static whitelist
- **THEN** it SHALL send a `login-form-detected-unapproved` message to the background instead of triggering a credential request

### Requirement: popup-permission-prompt
- **WHEN** the popup receives `login-form-detected-unapproved` from the background
- **THEN** the popup SHALL display a "New Domain" section at the top showing the domain name, with "Allow" and "Deny" buttons
- **WHEN** the user taps "Allow"
- **THEN** the dynamic script SHALL be registered, the domain added to `chrome.storage.sync`, and the credential request SHALL proceed

### Requirement: icon-badge-notification
- **WHEN** there are pending unapproved domains
- **THEN** the extension icon SHALL show a badge with the count of pending approvals

#### Scenario: allow-new-domain-flow
- **WHEN** the user visits a new login page and taps "Allow" in the popup
- **THEN** the domain SHALL be added to the approved list and the credential SHALL be auto-filled

#### Scenario: deny-new-domain-flow
- **WHEN** the user taps "Deny"
- **THEN** the domain SHALL be ignored and no script SHALL be registered; the user SHALL NOT be prompted again for the same domain within the same session
