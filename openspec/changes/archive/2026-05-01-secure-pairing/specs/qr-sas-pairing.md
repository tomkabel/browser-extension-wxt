## ADDED Requirements

### Requirement: QR displays 6-digit SAS code

The extension popup SHALL render a QR code encoding `smartid2-pair://<6-digit-auth-code>` and display the 6-digit code as large text below the QR.

#### Scenario: QR display

- **WHEN** the user clicks "Pair Phone" in the popup
- **THEN** the popup SHALL display a QR code on a `<canvas>` element
- **AND** the 6-digit SAS code SHALL be displayed as large text below the QR
- **AND** the QR SHALL encode only `smartid2-pair://<6-digit-code>` (no IP, no public keys)

### Requirement: Phone scans QR and confirms SAS

The Android app SHALL scan the QR with CameraX, extract the SAS code, display it for visual confirmation, and only proceed with pairing after the user confirms.

#### Scenario: SAS confirmation flow

- **WHEN** the phone scans the QR from the laptop screen
- **AND** extracts the 6-digit SAS code
- **THEN** the phone SHALL display "Pair with laptop? Code: <code>"
- **AND** wait for the user to tap "Confirm"
- **AND** only begin the Noise XX handshake AFTER confirmation
