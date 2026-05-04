## MODIFIED Requirements

### Requirement: QR displays 6-digit SAS code

The extension popup SHALL render a QR code encoding `smartid2-pair://<6-digit-auth-code>` and display the 6-digit code as large text below the QR when numeric SAS mode is active. When emoji SAS mode is active, the QR shall still encode the numeric code but the visual SAS shall be the 3 emoji derived from the session key.

#### Scenario: QR display with numeric SAS

- **WHEN** the user clicks "Pair Phone" in the popup AND numeric SAS mode is active
- **THEN** the popup SHALL display a QR code on a `<canvas>` element
- **AND** the 6-digit SAS code SHALL be displayed as large text below the QR
- **AND** the QR SHALL encode only `smartid2-pair://<6-digit-code>` (no IP, no public keys)

#### Scenario: QR display with emoji SAS

- **WHEN** the user clicks "Pair Phone" in the popup AND emoji SAS mode is active
- **THEN** the popup SHALL display a QR code on a `<canvas>` element
- **AND** the QR SHALL encode `smartid2-pair://<6-digit-code>` (numeric code always in URL for backward compat)
- **AND** the 3-emoji SAS SHALL be displayed below the QR as large emoji characters (minimum 48px)
- **AND** the numeric code SHALL NOT be visually displayed

### Requirement: Phone scans QR and confirms SAS

The Android app SHALL scan the QR with CameraX, extract the SAS code, display it for visual confirmation, and only proceed with pairing after the user confirms.

#### Scenario: SAS confirmation flow (numeric)

- **WHEN** the phone scans the QR from the laptop screen
- **AND** extracts the 6-digit SAS code
- **THEN** the phone SHALL display "Pair with laptop? Code: <code>"
- **AND** wait for the user to tap "Confirm"
- **AND** only begin the Noise XX handshake AFTER confirmation

#### Scenario: SAS confirmation flow (emoji)

- **WHEN** the phone scans the QR from the laptop screen
- **AND** extracts the 6-digit SAS code
- **AND** completes the Noise XX handshake and derives the 3-emoji SAS
- **THEN** the phone SHALL display the 3 emoji prominently
- **AND** display "Do these match your laptop screen?"
- **AND** wait for the user to tap "Yes, Match" or "No, Cancel"
- **AND** only complete pairing AFTER user confirms match
