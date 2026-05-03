## Purpose

version: 1.2.0

Define the transaction detection, command protocol, credential detection, and key rotation mechanisms used to securely verify banking transactions and deliver login credentials between the browser and phone.

## Requirements

### Requirement: Transaction detection on LHV.ee

A content script SHALL detect transaction data (amount, recipient, IBAN) from LHV.ee transaction confirmation pages.

#### Scenario: Transaction detected

- **WHEN** the user is on an LHV.ee transaction confirmation page
- **THEN** the content script SHALL extract `amount`, `recipient`, and optionally `iban` from the DOM
- **AND** return a `TransactionData` object with a `hash` field computed over the full context

#### Scenario: No transaction on page

- **WHEN** the user is on an LHV.ee page that is NOT a transaction confirmation (account overview, history, etc.)
- **THEN** `detectTransaction()` SHALL return `null`
- **AND** the popup SHALL display "No transaction detected on this page"

### Requirement: Login field detection (credential delivery)

A content script SHALL detect login forms (username + password fields) across static and SPA pages, complementing transaction detection.

#### Scenario: Login form detected

- **WHEN** the page contains an `input[type="password"]` element with a corresponding `input[type="text"]` or `input[type="email"]` in the same form
- **THEN** the content script SHALL emit a `detect-login-form` message with `{ usernameSelector, passwordSelector, formAction, domain, url }`

#### Scenario: Login page instead of transaction

- **WHEN** the user navigates to a page with a login form but no transaction data
- **THEN** `detectLoginForm()` SHALL return a valid result
- **AND** `detectTransaction()` SHALL return `null`
- **AND** the popup SHALL display credential-related UI instead of transaction UI

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

## Changelog

| Version | Date | Change | Source |
|---------|------|--------|--------|
| 1.0.0 | 2026-05-01 | Initial spec — transaction detection, command protocol, key rotation | `transaction-protocol` |
| 1.1.0 | 2026-05-01 | Added login field detection complementing transaction detection | `jit-credential-delivery` |
| 1.2.0 | 2026-05-01 | Wired `handleIncomingResponse()` into data channel handler; specified key rotation algorithm | `architectural-security-remediation` |
