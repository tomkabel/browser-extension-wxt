## ADDED Requirements

### Requirement: PairingPanel

The popup SHALL display a PairingPanel when no paired device exists.

#### Scenario: Unpaired state

- **WHEN** the popup opens and no paired device is stored in chrome.storage.session
- **THEN** the PairingPanel SHALL display a "Pair Phone" button
- **AND** clicking it SHALL show the QR code and the 3-emoji SAS (or 6-digit numeric, based on accessibility preference)
- **AND** "Match"/"No Match" buttons SHALL appear for emoji mode; "Confirm" for numeric mode

### Requirement: AuthPanel

The popup SHALL display an AuthPanel when paired but not authenticated.

#### Scenario: Authenticated state

- **WHEN** the popup opens and a paired device exists but no mfa session
- **THEN** the AuthPanel SHALL display an "Authenticate" button
- **AND** clicking it SHALL open chrome.tabs.create(pages/auth.html) and close the popup
- **AND** after re-opening the popup with an active session, the TransactionPanel SHALL be displayed

### Requirement: SessionStatus panel

The popup SHALL display a SessionStatus panel showing connection state and session health.

#### Scenario: Connected state

- **WHEN** the extension has an active session and device is connected
- **THEN** the SessionStatus SHALL display a green indicator and "Connected" label
- **AND** SHALL show the paired device name and connection RTT

#### Scenario: Disconnected state

- **WHEN** the session is active but the device is disconnected
- **THEN** the SessionStatus SHALL display a yellow indicator and "Reconnecting..." label
- **AND** SHALL NOT block interaction with other panels

### Requirement: TransactionPanel

The popup SHALL display a TransactionPanel when paired and authenticated, showing transaction data and verification status.

#### Scenario: Transaction verification

- **WHEN** MFA is active and transaction data is detected on the current page
- **THEN** the TransactionPanel SHALL display the amount and recipient
- **AND** a "Verify on Phone" button SHALL send authenticate_transaction to the phone
- **AND** the status SHALL update when the phone responds
