## ADDED Requirements

### Requirement: contentMessageBus tests cover handler registration

The project SHALL have `entrypoints/content/contentMessageBus.test.ts` with tests for `registerContentHandlers()` registration and message type routing.

#### Scenario: read-dom message type is routed correctly
- **WHEN** `registerContentHandlers()` is called and a `{ type: 'read-dom', payload: { maxLength: 50000 } }` message is emitted
- **THEN** the handler SHALL invoke `scrapePage` and return a structured `ScrapeResult`

#### Scenario: Unknown message type returns error
- **WHEN** a message with an unregistered type (e.g., `{ type: 'unknown-cmd', payload: {} }`) is emitted
- **THEN** the handler SHALL respond with `{ success: false, error: 'Unknown type: unknown-cmd' }`

### Requirement: contentMessageBus tests cover context invalidation guard

The contentMessageBus SHALL reject all messages when the extension context has been invalidated.

#### Scenario: Messages rejected after context invalidation
- **WHEN** `registerContentHandlers()` is called but `isContextValid` is set to false
- **THEN** any message SHALL receive `{ success: false, error: 'Context invalidated' }`

#### Scenario: Messages accepted when context is valid
- **WHEN** `registerContentHandlers()` is called and `isContextValid` is true
- **THEN** a valid `read-dom` message SHALL be processed normally, not rejected with context error

### Requirement: contentMessageBus tests cover structured response format

All message handler responses SHALL conform to `{ success: boolean, data?: unknown, error?: string }` format.

#### Scenario: Success response has correct format
- **WHEN** `scrapePage` returns successfully
- **THEN** the response SHALL include `success: true` with `data` containing the scrape result

#### Scenario: Error response has correct format
- **WHEN** `scrapePage` throws an error
- **THEN** the response SHALL include `success: false` with `error` as a string message
