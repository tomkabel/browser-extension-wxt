## ADDED Requirements

### Requirement: focus-on-panel-transition
- **WHEN** the popup transitions from one panel to another
- **THEN** focus SHALL move to the new panel's `<h1>` element

### Requirement: focus-trap
Keyboard focus SHALL be contained within the popup window. Tab SHALL cycle through all interactive elements without leaving the popup boundary.

### Requirement: prevent-scroll-on-focus
All programmatic `focus()` calls SHALL use `{ preventScroll: true }` to avoid scrolling the popup content.

#### Scenario: panel-focus-on-switch
- **WHEN** the user completes pairing (transition from PairingPanel to AuthPanel)
- **THEN** focus SHALL move to AuthPanel's `<h1>`
