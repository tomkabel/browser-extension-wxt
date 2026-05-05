## ADDED Requirements

### Requirement: Message parsing

The app SHALL listen on the Noise transport for incoming framed messages and parse them into command/response pairs.

#### Scenario: Receive and classify command
- **WHEN** the app receives a Noise-encrypted data message (version byte 0x00, type byte 0x01)
- **THEN** it SHALL decrypt the payload using the Noise session's recv transport
- **AND** it SHALL parse the decrypted JSON as a `ControlCommand`
- **AND** it SHALL dispatch to the appropriate handler based on `command` field (`credential-request`, `authenticate_transaction`, `ping`)

### Requirement: CredentialRequest handler

The app SHALL respond to `credential-request` commands by looking up stored credentials and returning them encrypted.

#### Scenario: Credential found
- **WHEN** the app receives `credential-request` with `{ domain, url, usernameFieldId, passwordFieldId }`
- **AND** the vault contains stored credentials for that domain
- **THEN** it SHALL prompt the user for biometric authentication
- **AND** on success, SHALL return `{ status: 'found', username, password, approval_mode: 'auto' }`

#### Scenario: Credential not found
- **WHEN** the app receives `credential-request` for an unknown domain
- **THEN** it SHALL return `{ status: 'not_found' }`

### Requirement: AuthenticateTransaction handler

The app SHALL respond to `authenticate_transaction` commands by dispatching the GhostActuator for PIN injection.

#### Scenario: Transaction received
- **WHEN** the app receives `authenticate_transaction` with `{ amount, recipient, timestamp }`
- **THEN** it SHALL check the vault for a stored Smart-ID PIN
- **AND** if found, SHALL decode the PIN and call `GhostActuatorModule.holdSequence()` with the mapped screen coordinates
- **AND** SHALL notify the user via notification/haptic that PIN injection is held
- **AND** SHALL return `{ status: 'pending', approval_mode: 'biometric' }`

### Requirement: Ping handler

The app SHALL respond to `ping` commands with a `pong` response.

#### Scenario: Ping received
- **WHEN** the app receives `ping` with `{ ts }`
- **THEN** it SHALL return `{ status: 'pong', sequence }` immediately

### Requirement: Malformed command handling

The command server SHALL reject commands that fail cryptographic or structural validation.

#### Scenario: Decryption failure
- **WHEN** a Noise-encrypted message cannot be decrypted (session mismatch, replay with wrong key)
- **THEN** the app SHALL drop the message silently
- **AND** SHALL NOT send an error response (to avoid oracle attacks)
- **AND** SHALL increment a metrics counter for failed decryptions

#### Scenario: Invalid JSON payload
- **WHEN** the decrypted payload is not valid JSON or is not a valid `ControlCommand`
- **THEN** the app SHALL drop the message
- **AND** SHALL NOT respond with any error data that reveals parsing state

#### Scenario: Unknown command type
- **WHEN** the decrypted payload has a valid `ControlCommand` structure but the `command` field does not match any known `CommandType`
- **THEN** the app SHALL return `{ status: 'error', error: 'unknown_command' }` with the original `sequence` number
- **AND** SHALL log the unknown command type for debugging
