## ADDED Requirements

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

### Requirement: Command protocol

Control commands and responses SHALL follow the versioned, sequence-numbered format.

#### Scenario: Command with anti-replay sequence

- **WHEN** the extension sends a command
- **THEN** the command SHALL include a monotonically increasing `sequence` number
- **AND** the phone SHALL reject `sequence <= lastSequence`
- **AND** duplicate sequences SHALL return cached responses

#### Scenario: Key rotation at 1000 messages

- **WHEN** the cipher state message counter reaches 1000
- **THEN** both sides SHALL derive new encryption keys via `HKDF(current_key, salt=current_nonce, info="smartid2-noise-rotate")`
- **AND** the message counter SHALL reset to 0
