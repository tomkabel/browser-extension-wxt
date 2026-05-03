## ADDED Requirements

### Requirement: Rate limit mfa-assertion handler

The `mfa-assertion` message handler in the background service worker SHALL apply rate limiting to prevent brute-force session activation.

#### Scenario: Rate limit enforced within window

- **WHEN** more than 3 `mfa-assertion` calls arrive within a 60-second window
- **THEN** the 4th and subsequent calls SHALL return `{ success: false, error: 'Rate limited' }`
- **AND** the handler SHALL NOT call `activateSession()`

### Requirement: Replay protection for assertions

The `mfa-assertion` handler SHALL reject duplicate assertion data to prevent replay attacks.

#### Scenario: Duplicate assertion rejected

- **WHEN** the same `credentialId + clientDataJSON + authenticatorData` tuple is received within 5 minutes
- **THEN** the handler SHALL return `{ success: false, error: 'Assertion replay detected' }`
- **AND** SHALL NOT create a new session

### Requirement: Auth page attempt cooldown

The WebAuthn auth page SHALL limit registration and authentication attempts.

#### Scenario: Too many failed attempts

- **WHEN** authentication or registration fails 3 times within 60 seconds
- **THEN** the auth page SHALL display a cooldown message
- **AND** SHALL disable buttons for 60 seconds
- **AND** SHALL display remaining cooldown time
