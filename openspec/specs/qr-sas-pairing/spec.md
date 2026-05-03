version: 1.1.0

## MODIFIED Requirements

### Requirement: QR displays SAS code (both numeric and emoji modes)

The extension popup SHALL render a QR code encoding `smartid2-pair://<6-digit-auth-code>` and display the 3-emoji SAS when emoji mode is active, or the 6-digit numeric code when numeric mode is active. The QR payload SHALL always use the numeric code for backward compatibility.

#### Scenario: QR display with emoji SAS (default)

- **WHEN** the user clicks "Pair Phone" in the popup AND emoji SAS mode is active
- **THEN** the popup SHALL display a QR code on a `<canvas>` element
- **AND** the QR SHALL encode `smartid2-pair://<6-digit-code>` (numeric code always in URL for backward compat)
- **AND** the 3-emoji SAS SHALL be displayed below the QR as large emoji characters (minimum 48px)
- **AND** the numeric code SHALL NOT be visually displayed
- **AND** "Match"/"No Match" buttons SHALL appear below the emoji

#### Scenario: QR display with numeric SAS (accessibility fallback)

- **WHEN** the user clicks "Pair Phone" in the popup AND numeric SAS mode is active
- **THEN** the popup SHALL display a QR code on a `<canvas>` element
- **AND** the 6-digit SAS code SHALL be displayed as large text below the QR
- **AND** the QR SHALL encode only `smartid2-pair://<6-digit-code>` (no IP, no public keys)

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

## Changelog

| Version | Date | Change | Source |
|---------|------|--------|--------|
| 1.0.0 | 2026-05-01 | Initial spec — QR display with 6-digit numeric SAS, phone scan and confirm | `secure-pairing` |
| 1.1.0 | 2026-05-01 | Added emoji SAS support (both numeric and emoji modes) | `emoji-sas-verification` |
