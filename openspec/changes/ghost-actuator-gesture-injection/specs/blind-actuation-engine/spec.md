## ADDED Requirements

### Requirement: dispatchGesture invocation

The GhostActuatorService SHALL invoke `dispatchGesture()` with the constructed GestureDescription and monitor the result.

#### Scenario: Gesture completes successfully

- **WHEN** `dispatchGesture()` is called with a valid GestureDescription
- **AND** the system successfully executes all strokes
- **THEN** the `GestureResultCallback.onCompleted()` SHALL be invoked
- **AND** the service SHALL return success via CompletableFuture

#### Scenario: Gesture cancelled by system

- **WHEN** `dispatchGesture()` is called and the system cancels execution
- **THEN** the `GestureResultCallback.onCancelled()` SHALL be invoked
- **AND** the service SHALL retry with adjusted coordinates up to `maxRetries` (default 2)

#### Scenario: Target app verification

- **WHEN** `executeGestureSequence()` is called
- **THEN** the service SHALL verify `rootInActiveWindow.packageName == "ee.sk.smartid"`
- **AND** if the target is not Smart-ID, SHALL abort and return failure

### Requirement: Execution confirmation via accessibility events

The GhostActuatorService SHALL monitor the Accessibility event stream for PIN acceptance or rejection.

#### Scenario: PIN accepted

- **WHEN** a `TYPE_WINDOW_STATE_CHANGED` event indicates the Smart-ID processing screen appeared
- **THEN** the service SHALL notify the Java Orchestrator of success

#### Scenario: PIN rejected

- **WHEN** a `TYPE_WINDOW_CONTENT_CHANGED` event indicates an error dialog appeared
- **THEN** the service SHALL notify the Orchestrator with `PinError.INCORRECT_PIN`
