## ADDED Requirements

### Requirement: Emoji SAS derivation from session key + QR binding

Both the extension and the phone SHALL independently derive a 4-emoji SAS from the Noise handshake chaining key combined with the QR code public key, after the XX handshake completes.

#### Scenario: SAS derivation after successful handshake

- **WHEN** the Noise XX handshake completes successfully on both sides
- **THEN** each side SHALL compute `sas_seed = SHA-256(chainingKey || qrCodePublicKey)`
- **AND** extract 24 bits from the first 4 bytes of `sas_seed` as 4 × 6-bit indices
- **AND** map each 6-bit index to an emoji from the fixed 64-emoji palette
- **AND** the QR public key binding prevents MITM at QR printing stage — an attacker who swaps the QR cannot produce the same SAS

#### Scenario: Both sides derive the same SAS

- **WHEN** both sides derive the SAS from the same chaining key and same QR public key
- **THEN** both SHALL display the same 4 emoji
- **AND** the SAS SHALL NOT be transmitted over the wire

#### Scenario: Increased entropy from 4 emoji

- **GIVEN** the emoji palette contains 64 emoji (6 bits each)
- **WHEN** 4 emoji are selected (24 bits total)
- **THEN** the SAS space SHALL be 64⁴ = 16.7 million combinations
- **AND** an attacker SHALL have a 1/16.7M chance of guessing a single SAS
- **AND** with 3 retries, the probability SHALL be ~1/5.6M

### Requirement: Emoji SAS display on extension popup

The extension popup SHALL display the 4-emoji SAS alongside the QR code during pairing.

#### Scenario: Emoji display

- **WHEN** the extension completes the Noise XX handshake and derives the SAS
- **THEN** the popup SHALL display the 4 emoji as large, centered characters (minimum 48px font size)
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

The Android app SHALL display the 4-emoji SAS after scanning the QR code.

#### Scenario: Phone emoji display

- **WHEN** the phone completes the Noise XX handshake and derives the SAS
- **THEN** the phone SHALL display the 4 emoji prominently
- **AND** display "Do these symbols match your laptop screen?"
- **AND** provide "Yes, Match" and "No, Cancel" buttons
- **AND** ONLY complete pairing after the user confirms "Yes, Match"

#### Scenario: Numeric fallback for accessibility

- **WHEN** TalkBack or another screen reader is active on the phone
- **THEN** the phone SHALL display a 6-digit numeric SAS instead of emoji
- **AND** the 6-digit SAS SHALL be derived from the same seed but converted to digits
- **AND** provide a "Confirm" button to accept the match
