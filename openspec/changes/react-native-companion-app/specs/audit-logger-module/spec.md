## ADDED Requirements

### Requirement: AuditLogger RN Native Module

The app SHALL expose the existing `AuditLogger.kt` to React Native via a Native Module.

#### Scenario: Log entry from JS
- **WHEN** JS calls `AuditLoggerModule.logEntry({ sessionId, timestamp, transactionHash, ... })`
- **THEN** the module SHALL call `AuditLogger.logEntry()` with the constructed `QesAuditEntry`

#### Scenario: Export audit log
- **WHEN** JS calls `AuditLoggerModule.exportLog()`
- **THEN** the module SHALL return the exported JSON string from `AuditLogger.exportAuditLog()`
