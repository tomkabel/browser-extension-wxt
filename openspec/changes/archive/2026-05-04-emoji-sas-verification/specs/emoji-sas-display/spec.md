## ADDED Requirements

### Requirement: Emoji SAS derivation from session key

Both the extension and the phone SHALL independently derive a 3-emoji SAS from the Noise handshake session key after the XX handshake completes.

#### Scenario: SAS derivation after successful handshake

- **WHEN** the Noise XX handshake completes successfully on both sides
- **THEN** each side SHALL compute `sas_bytes = SHA-256(transport_state.encryption_key)`
- **AND** extract 18 bits from the first 3 bytes of `sas_bytes` as 3 × 6-bit indices
- **AND** map each 6-bit index to an emoji from the fixed 64-emoji palette

#### Scenario: Both sides derive the same SAS

- **WHEN** both sides derive the SAS from the same session key
- **THEN** both SHALL display the same 3 emoji
- **AND** the SAS SHALL NOT be transmitted over the wire

### Requirement: Emoji SAS display on extension popup

The extension popup SHALL display the 3-emoji SAS alongside the QR code during pairing.

#### Scenario: Emoji display

- **WHEN** the extension completes the Noise XX handshake and derives the SAS
- **THEN** the popup SHALL display the 3 emoji as large, centered characters (minimum 48px font size)
- **AND** display a "Match" button and a "No Match" button
- **AND** the pairing SHALL NOT complete until the user taps "Match"

#### Scenario: User confirms match

- **WHEN** the user taps "Match" on the extension
- **THEN** the extension SHALL send a `pairing-confirmed` message to the phone
- **AND** transition the pairing state to `paired`

#### Scenario: User rejects match

- **WHEN** the user taps "No Match"
- **THEN** the extension SHALL abort the pairing
- **AND** clear all session state
- **AND** return to the "unpaired" state

### Requirement: Emoji SAS display on phone

The Android app SHALL display the 3-emoji SAS after scanning the QR code.

#### Scenario: Phone emoji display

- **WHEN** the phone completes the Noise XX handshake and derives the SAS
- **THEN** the phone SHALL display the 3 emoji prominently
- **AND** display "Do these symbols match your laptop screen?"
- **AND** provide "Yes, Match" and "No, Cancel" buttons
- **AND** ONLY complete pairing after the user confirms "Yes, Match"
