## ADDED Requirements

### Requirement: Non-obscuring QES overlay

The Android Vault SHALL display a transparent, non-clickable system overlay during the QES waiting period.

#### Scenario: Overlay displayed

- **WHEN** the HIG transitions to WAITING state
- **THEN** the overlay SHALL be created with `TYPE_APPLICATION_OVERLAY` (API 26+)
- **AND** SHALL have `FLAG_NOT_FOCUSABLE` and `FLAG_NOT_TOUCHABLE` set (passes all touch events through)
- **AND** SHALL be positioned at the bottom third of the screen
- **AND** SHALL NOT obscure the Smart-ID app's transaction display area (upper two-thirds)

#### Scenario: Overlay content

- **WHEN** the overlay is displayed
- **THEN** it SHALL show: "QES SIGNATURE ARMED", transaction verification status, countdown timer (seconds remaining), "Press VOLUME DOWN to authorize", "Press VOLUME UP to cancel"
- **AND** the background SHALL be semi-transparent to allow viewing the Smart-ID app beneath

#### Scenario: Overlay dismissed

- **WHEN** the HIG transitions to RELEASED, CANCELLED, or COMPLETED
- **THEN** the overlay SHALL be dismissed immediately
