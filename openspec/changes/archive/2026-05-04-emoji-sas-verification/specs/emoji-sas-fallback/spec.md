## ADDED Requirements

### Requirement: Accessibility fallback to numeric SAS

The extension SHALL detect accessibility preferences and fall back to the 6-digit numeric SAS when screen readers or reduced-motion preferences are active.

#### Scenario: Screen reader detected

- **WHEN** the user has a screen reader active
- **AND** the extension detects this via `navigator.userAgent` or accessibility API
- **THEN** the pairing SHALL use the 6-digit numeric SAS instead of emoji
- **AND** the numeric SAS SHALL be displayed as large monospace text

#### Scenario: Manual numeric toggle

- **WHEN** the user taps a "Use digits instead" button in the pairing panel
- **THEN** the SAS SHALL switch to numeric display immediately
- **AND** the phone SHALL also be notified to display numeric SAS

#### Scenario: Emoji fallback on emoji-unsupported platform

- **WHEN** the extension detects that the current platform does not support emoji rendering
- **THEN** the pairing SHALL automatically use numeric SAS
- **AND** display a message "Using numeric codes for compatibility"
