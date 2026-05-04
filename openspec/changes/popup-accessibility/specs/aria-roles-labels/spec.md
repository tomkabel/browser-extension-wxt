## ADDED Requirements

### Requirement: qr-canvas-aria
The QR canvas in `PairingPanel` SHALL have `role="img"` and `aria-label="Pairing QR code. Use the numeric code displayed below as an alternative."`.

### Requirement: sas-display-live-region
The SAS display SHALL have `aria-live="polite"` and `role="status"`. The numeric SAS code SHALL be announced when it changes.

### Requirement: transport-indicator-status
`TransportIndicator` SHALL have `role="status"` with `aria-live="polite"`. It SHALL announce transport changes ("Connected via USB", "Connected via WebRTC").

### Requirement: session-countdown-timer
`SessionStatus` SHALL have `role="timer"` with `aria-label="Session expires in X seconds"`. The countdown value SHALL be updated every second.

### Requirement: transaction-status-assertive
`TransactionPanel` status messages SHALL use `aria-live="assertive"` for transaction confirm/reject notifications.

### Requirement: credential-status-live
`CredentialPanel` status messages SHALL use `aria-live="polite"` for "Credentials filled" announcements.

#### Scenario: screen-reader-announces-sas
- **WHEN** the SAS code is displayed
- **THEN** a screen reader SHALL announce the numeric SAS code via the aria-live region
