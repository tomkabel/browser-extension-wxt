## ADDED Requirements

### Requirement: Smart-ID PIN grid layout extraction

The PinGridAnalyzer SHALL extract digit button positions from the Smart-ID app's Accessibility tree.

#### Scenario: Grid found by resource ID

- **WHEN** the Smart-ID app's PIN entry activity is in the foreground
- **AND** the Accessibility tree contains a grid container with resource ID `com.smartid:id/keypad_*`
- **THEN** the analyzer SHALL locate the grid container
- **AND** iterate its children to find digit buttons
- **AND** compute each button's `exactCenterX()` and `exactCenterY()`
- **AND** return `GridInfo` with center positions ordered by `(top * 10000 + left)`

#### Scenario: Grid not found, fall back to heuristic

- **WHEN** no grid container is found by resource ID
- **THEN** the analyzer SHALL use position-based heuristics to identify digit buttons (button count between 10-12, grid-like layout)
- **AND** compute centers from screen bounds

#### Scenario: Non-Smart-ID app in foreground

- **WHEN** the foreground app is not the Smart-ID app (`ee.sk.smartid`)
- **THEN** the analyzer SHALL return null
