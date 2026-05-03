## MODIFIED Requirements

### Requirement: Command protocol — Response pipeline

Control commands and responses SHALL follow the versioned, sequence-numbered format.

**MODIFICATION**: `handleIncomingResponse()` in `commandClient.ts` MUST be wired into the data channel message handler. Previously this function was never called, causing all pending commands to time out.

#### Scenario: Incoming response resolves pending command

- **WHEN** a `ControlResponse` message arrives on the data channel
- **THEN** the offscreen document's `onmessage` handler SHALL call `commandClient.handleIncomingResponse(raw)`
- **AND** if a pending command with matching `sequence` exists
- **THEN** the pending promise SHALL resolve with the response data
- **AND** the entry SHALL be removed from the pending map

#### Scenario: Command timeout when no response arrives

- **WHEN** a command is sent
- **AND** no response arrives within `ACK_TIMEOUT_MS` (5000ms)
- **AND** `MAX_RETRIES` (3) is exhausted
- **THEN** the command promise SHALL reject with `Error('Command N failed after 3 retries')`

### Requirement: Key rotation at 1000 messages

The extension and phone SHALL rotate encryption keys after 1000 messages to prevent nonce exhaustion.

**MODIFICATION**: Key rotation algorithm specified: `HKDF(current_key, salt=current_nonce, info="smartid2-noise-rotate")`.

#### Scenario: Key rotation triggered

- **WHEN** the cipher state message counter reaches 1000
- **THEN** both sides SHALL derive new encryption keys via `HKDF(current_key, salt=current_nonce, info="smartid2-noise-rotate")`
- **AND** the message counter SHALL reset to 0
