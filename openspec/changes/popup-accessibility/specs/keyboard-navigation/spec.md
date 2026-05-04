## ADDED Requirements

### Requirement: tab-order
The Tab key SHALL move focus through interactive elements in visual (left-to-right, top-to-bottom) order.

### Requirement: escape-closes-popup
Pressing Escape SHALL close the popup.

### Requirement: enter-space-activates
Pressing Enter or Space on a focused button, link, or toggle SHALL activate it.

### Requirement: visible-focus-indicator
All interactive elements SHALL have a visible focus ring (minimum 2px solid outline, color contrast ≥ 3:1 against adjacent background).

#### Scenario: keyboard-navigates-panels
- **WHEN** the user presses Tab repeatedly
- **THEN** focus SHALL cycle through all interactive elements in the active panel
