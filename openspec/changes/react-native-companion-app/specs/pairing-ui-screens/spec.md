## ADDED Requirements

### Requirement: QR scanner screen

The app SHALL provide a QR scanner screen as the primary pairing method.

#### Scenario: Scan valid QR
- **WHEN** the user opens the pairing screen and the camera scans a QR code
- **AND** the QR content matches `smartid2-pair://<6-digit-sas>?nonce=...&commitment=...`
- **THEN** the app SHALL extract the SAS code, nonce, and commitment
- **AND** SHALL connect to the signalling server with the SAS code
- **AND** SHALL display "Connecting..." with a spinner

#### Scenario: Invalid QR
- **WHEN** the scanned QR does not match the expected URI scheme
- **THEN** the app SHALL display an error "Invalid pairing QR code"
- **AND** SHALL re-enable the scanner for a new scan

### Requirement: Emoji SAS confirmation screen

The app SHALL display the 3-emoji SAS after the Noise handshake completes for user verification.

#### Scenario: Display emoji SAS
- **WHEN** the Noise XX handshake completes
- **THEN** the app SHALL display the 3 derived emojis in large font at the center of the screen
- **AND** SHALL display text "Confirm these emojis match the browser extension"
- **AND** SHALL wait for the user to confirm on the extension side

### Requirement: Connection status indicator

The app SHALL display the current connection state to the user.

#### Scenario: Paired and connected
- **WHEN** the app is paired and the data channel is open
- **THEN** the home screen SHALL show a green "Connected" indicator
- **AND** SHALL display the paired device name

#### Scenario: Disconnected
- **WHEN** the data channel closes
- **THEN** the app SHALL show a red "Disconnected" indicator
- **AND** SHALL display "Reconnecting..." during backoff

#### Scenario: Camera permission denied
- **WHEN** the user opens the QR scanner for the first time
- **AND** denies the camera permission prompt
- **THEN** the app SHALL display a rationale screen explaining why camera access is needed for QR pairing
- **AND** SHALL provide a "Open Settings" button directing the user to `App Settings → Permissions → Camera`

#### Scenario: QR scan decodes invalid content
- **WHEN** the camera successfully scans a QR code
- **AND** its content does not start with `smartid2-pair://`
- **THEN** the app SHALL display a toast "Not a SmartID pairing QR code"
- **AND** SHALL re-enable the scanner within 1 second for a new scan

#### Scenario: Emoji SAS mismatch (user rejects on desktop)
- **WHEN** the Noise handshake completes and the app displays the 3-emoji SAS
- **AND** the user rejects the SAS match on the browser extension popup (presses "Emojis don't match")
- **THEN** the app SHALL receive a disconnect from the signaling server
- **AND** SHALL display "Pairing rejected — emojis did not match. Please generate a new QR code."
- **AND** SHALL return to the QR scanner screen

#### Scenario: Pairing timeout (no SAS confirmation within 60s)
- **WHEN** the QR code is scanned and the Noise handshake completes
- **AND** the user does not confirm the SAS match on either phone or desktop within 60 seconds
- **THEN** the app SHALL display "Pairing timed out — please scan a new QR code"
- **AND** SHALL disconnect from the signaling server
- **AND** SHALL return to the home screen
