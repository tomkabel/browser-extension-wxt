## ADDED Requirements

### Requirement: Gesture sequence from coordinate array

The GhostActuatorService SHALL convert a float coordinate array into a timed GestureDescription stroke sequence.

#### Scenario: Single tap constructed

- **GIVEN** a coordinate array `[x, y]` and default GestureOptions
- **WHEN** `executeGestureSequence()` is called
- **THEN** a single `GestureDescription.StrokeDescription` SHALL be created
- **AND** the stroke SHALL start at (x, y) and have duration 50ms

#### Scenario: Multi-digit tap sequence

- **GIVEN** coordinates for a 4-digit PIN: `[x1, y1, x2, y2, x3, y3, x4, y4]`
- **WHEN** `executeGestureSequence()` is called
- **THEN** four sequential strokes SHALL be created with timing: tap 1 at 0ms for 50ms, pause 100ms, tap 2 at 150ms for 50ms, pause 100ms, tap 3 at 300ms for 50ms, pause 100ms, tap 4 at 450ms for 50ms
- **AND** the total gesture duration SHALL be 550ms

#### Scenario: Configurable timing

- **WHEN** `GestureOptions` has custom `tapDurationMs` and `interTapDelayMs`
- **THEN** the stroke timings SHALL use the configured values
