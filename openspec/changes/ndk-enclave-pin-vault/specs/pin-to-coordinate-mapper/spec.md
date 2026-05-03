## ADDED Requirements

### Requirement: PIN digit to coordinate mapping

The NDK enclave SHALL map decrypted PIN digits to anonymous X/Y float coordinates based on Java-provided grid layout bounds.

#### Scenario: Standard PIN digit mapping

- **GIVEN** a decrypted PIN string "12345" and a layout bounds array with 20 entries (10 digit positions × 2 coordinates)
- **WHEN** the mapper processes each digit
- **THEN** char '1' maps to `layoutBounds[0]`, `layoutBounds[1]`
- **AND** char '2' maps to `layoutBounds[2]`, `layoutBounds[3]`
- **AND** char '3' maps to `layoutBounds[4]`, `layoutBounds[5]`
- **AND** char '4' maps to `layoutBounds[6]`, `layoutBounds[7]`
- **AND** char '5' maps to `layoutBounds[8]`, `layoutBounds[9]`
- **AND** digit '0' maps to `layoutBounds[18]`, `layoutBounds[19]` (index 9)

#### Scenario: Variable PIN length

- **WHEN** the PIN is 4 digits (PIN1 short form) or 6 digits (PIN1 long form)
- **THEN** the mapper SHALL produce the correct number of coordinate pairs
- **AND** SHALL NOT pad or truncate

#### Scenario: Invalid layout bounds

- **WHEN** the layout bounds array does not have exactly 20 entries
- **THEN** the mapper SHALL return an error
- **AND** SHALL NOT produce coordinate output
