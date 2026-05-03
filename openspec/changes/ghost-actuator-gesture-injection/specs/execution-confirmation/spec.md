## ADDED Requirements

### Requirement: Execution confirmation and error recovery

The GhostActuator SHALL confirm gesture execution outcome and implement error recovery.

#### Scenario: Screen state check before injection

- **WHEN** the GhostActuator prepares to inject gestures
- **THEN** it SHALL verify `isScreenOn()` returns true
- **AND** SHALL verify no system dialog (notification panel, battery saver) is active
- **AND** if either check fails, SHALL wait 500ms and retry up to 2 times

#### Scenario: Retry on injection failure

- **WHEN** `dispatchGesture()` returns cancelled
- **THEN** the service SHALL retry after `retryDelayMs` (default 500ms)
- **AND** adjust coordinates by ±5px on each retry
- **AND** after `maxRetries` failures, SHALL abort and report failure to Orchestrator

#### Scenario: Fallback on persistent failure

- **WHEN** all retries are exhausted
- **THEN** the service SHALL notify the user that manual phone interaction is required
- **AND** fall back to WebRTC-based manual phone interaction flow
