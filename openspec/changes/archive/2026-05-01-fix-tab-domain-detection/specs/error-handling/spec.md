## ADDED Requirements

### Requirement: Tab readiness validation

The system SHALL validate that the active tab is ready before attempting communication.

#### Scenario: Tab not ready

- **WHEN** the active tab's status is not `complete`
- **THEN** the system SHALL return an error "Tab not ready, please wait and try again"

#### Scenario: No tab ID available

- **WHEN** the active tab query returns a tab without an ID
- **THEN** the system SHALL return an error "Unable to identify active tab"

### Requirement: Content script availability check

The system SHALL handle cases where the content script is not loaded on the active tab.

#### Scenario: Content script not loaded

- **WHEN** sending a message to the content script fails with "Could not establish connection" or "Receiving end does not exist"
- **THEN** the system SHALL return an error "Content script not loaded on this page"

#### Scenario: Context invalidated

- **WHEN** the content script context is invalidated (extension reload/update)
- **THEN** WXT's `ctx.onInvalidated()` callback SHALL be called
- **AND** resources SHALL be cleaned up

**NOTE**: `window.unload` does NOT fire for extension context invalidation. Use `ctx.onInvalidated()`.

#### Scenario: Timeout waiting for content script

- **WHEN** the content script does not respond within 5 seconds
- **THEN** the system SHALL return an error "Content script response timeout"

### Requirement: Rate limiting handling

The system SHALL handle rate limiting gracefully.

#### Scenario: Rate limit exceeded

- **WHEN** the content script detects rate limit exceeded
- **THEN** it SHALL return `{ success: false, error: 'Rate limited', retryAfterMs: 30000 }`

#### Scenario: Backoff period active

- **WHEN** the content script is in backoff period after exceeding limits
- **THEN** it SHALL return `{ success: false, error: 'Too many requests, please wait', retryAfterMs: 60000 }`

### Requirement: Graceful error propagation

All errors SHALL be propagated to the popup with meaningful messages for user feedback.

#### Scenario: Popup displays error to user

- **WHEN** any step in the extraction flow fails
- **THEN** the popup SHALL display the error message to the user in a user-friendly format

#### Scenario: API call not attempted on error

- **WHEN** content extraction fails
- **THEN** the popup SHALL NOT attempt the REST API call

#### Scenario: Error recovery suggestions

- **WHEN** an error includes a `retryAfterMs` value
- **THEN** the popup SHALL display a retry countdown and button

### Requirement: Background error handling

The background script SHALL handle API errors gracefully.

#### Scenario: API returns 4xx error

- **WHEN** the API returns a client error (4xx status)
- **THEN** the error SHALL be marked as **non-recoverable** and returned immediately
- **AND** retry SHALL NOT be attempted

**FIXED**: Previous implementation incorrectly marked 4xx as recoverable.

#### Scenario: API returns 5xx error

- **WHEN** the API returns a server error (5xx status)
- **THEN** the retry logic SHALL attempt up to 3 retries with exponential backoff

#### Scenario: API returns 429 (Rate Limited)

- **WHEN** the API returns 429 Too Many Requests
- **THEN** the error SHALL be marked as recoverable
- **AND** retry with backoff SHALL be attempted

#### Scenario: API timeout

- **WHEN** the API request exceeds 30 seconds
- **THEN** it SHALL be aborted and return "Request timeout"

**NOTE**: Previous implementation created a setTimeout that was never cleared. Use `AbortSignal.timeout()` or clear the timeout on success.

### Requirement: Error types

The system SHALL use structured error types:

```typescript
ExtensionError {
  message: string
  code: string        // e.g., 'RATE_LIMIT', 'CONTEXT_INVALID', 'API_ERROR'
  recoverable: boolean
}

RateLimitError extends ExtensionError {
  retryAfterMs?: number
}

ApiError extends ExtensionError {
  statusCode?: number
  // recoverable = true for 5xx and 429 ONLY
  // recoverable = false for 4xx
}
```

**FIXED**: ApiError recoverability is now correctly `statusCode >= 500 || statusCode === 429`

### Requirement: Retry logic

The retry utility SHALL implement exponential backoff with jitter.

#### Scenario: Retryable errors

- **WHEN** the error is: network failure, 5xx server error, 429 rate limit, or AbortError
- **THEN** retry SHALL be attempted with exponential backoff

#### Scenario: Non-retryable errors

- **WHEN** the error is: 4xx client error (except 429), TypeError (CORS/invalid URL), or programming error
- **THEN** retry SHALL NOT be attempted

**FIXED**: TypeError is no longer considered retryable. It usually indicates CORS failure or invalid URL which will not be resolved by retrying.

### Requirement: Service worker ephemerality

The system SHALL accept MV3 service worker ephemeral lifecycle.

#### Scenario: Service worker dies during operation

- **WHEN** the service worker is terminated during a long operation
- **THEN** the operation SHALL be retried when the service worker restarts
- **AND** the popup SHALL handle this gracefully with retry UI

#### Scenario: No artificial keep-alive

- **WHEN** implementing long-running operations
- **THEN** the system SHALL NOT use KeepAlive alarms to keep service worker alive
- **WHY**: Chrome MV3 explicitly discourages this and it doesn't actually work
- **USE**: Offscreen documents for operations >30s, or chunk work

### Requirement: Content script cleanup via WXT lifecycle

The content script SHALL use WXT's context lifecycle for proper cleanup.

#### Scenario: Extension reload

- **WHEN** the extension is reloaded
- **THEN** WXT SHALL call `ctx.onInvalidated()` callback
- **AND** all `ctx.addEventListener()` registered listeners SHALL be automatically cleaned up

#### Scenario: Proper cleanup pattern

```typescript
export default defineContentScript({
  main(ctx) {
    // Register listeners with ctx for automatic cleanup
    ctx.addEventListener(window, 'wxt:locationchange', handleLocationChange)
    ctx.addEventListener(window, 'unload', handleUnload)

    // Manual cleanup for resources
    ctx.onInvalidated(() => {
      clearInterval(myInterval)
      // All ctx listeners auto-cleaned
    })
  },
})
```
