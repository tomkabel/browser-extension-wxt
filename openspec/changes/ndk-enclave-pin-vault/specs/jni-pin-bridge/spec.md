## ADDED Requirements

### Requirement: JNI bridge for enclave invocation

The Java/Kotlin layer SHALL provide a JNI bridge that passes ciphertext and layout bounds to the C++ enclave and receives anonymous float coordinates.

#### Scenario: JNI invocation

- **GIVEN** ciphertext from Android Keystore and layout bounds from PinGridAnalyzer
- **WHEN** the Java Orchestrator calls the `native decryptAndMap(ciphertext, layoutBounds)` method
- **THEN** the C++ function SHALL return a `float[]` of coordinate pairs (2 floats per PIN digit)
- **AND** the returned array SHALL NOT be logged or persisted by the Java layer
- **AND** the Java layer SHALL pass the coordinates directly to GhostActuator without intermediate storage

#### Scenario: JNI call with invalid inputs

- **WHEN** `decryptAndMap()` receives invalid ciphertext or null layout bounds
- **THEN** the C++ function SHALL return an empty `float[]`
- **AND** SHALL NOT crash the JVM
