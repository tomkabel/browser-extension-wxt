## ADDED Requirements

### Requirement: Page content extraction

The content script SHALL extract structured content from the current page including textContent, headings, links, and images.

#### Scenario: Successfully extract structured content

- **WHEN** the content script receives a `read-dom` message from the popup
- **THEN** it SHALL return a `ScrapeResult` with `success: true` and extracted data
- **AND** include `text`, `headings`, `linkCount`, `imageCount`, and `filtered` flag

#### Scenario: Content script uses document.location directly

- **WHEN** extracting content
- **THEN** the content script SHALL use `document.location.href` and `document.location.hostname` directly
- **AND** shall NOT call `browser.tabs.query` to find its own tab ID

#### Scenario: Handle empty content

- **WHEN** `document.body.textContent` is empty or null
- **THEN** the content script SHALL return `success: true` with `text: ''`
- **AND** the `filtered` flag SHALL indicate if content was filtered

#### Scenario: Handle extraction errors

- **WHEN** an error occurs during text extraction (e.g., CSP restrictions, context invalidated)
- **THEN** the content script SHALL catch the error and return `{ success: false, error: <error message> }`

#### Scenario: Rate limiting

- **WHEN** the content script receives a `read-dom` message but is rate limited
- **THEN** the content script SHALL return `{ success: false, error: 'Rate limited', retryAfterMs: <ms> }`

### Requirement: Content script registration

The content script SHALL be registered with specific target domains, not `<all_urls>`.

#### Scenario: Content script loaded on target domains

- **WHEN** the extension is built with content script matches for specific domains
- **THEN** the content script SHALL be loaded only on declared domains
- **AND** NOT on all URLs

#### Scenario: Content script uses document_idle timing

- **WHEN** the content script loads
- **THEN** it SHALL use `document_idle` timing (not `document_end`)
- **WHY**: `document_idle` ensures dynamic content has loaded

#### Scenario: Message listener registration

- **WHEN** the content script loads on a page
- **THEN** it SHALL register a listener for `browser.runtime.onMessage` events
- **AND** handle `read-dom` and `get-structured-content` message types

### Requirement: Structured content format

The extracted content SHALL include the following structured data:

```
ScrapeResult {
  success: boolean
  text?: string           // Filtered textContent
  headings?: string[]      // h1-h6 text content, max 50
  linkCount?: number       // Count of http/https links
  imageCount?: number      // Count of img elements
  filtered?: boolean       // True if PII was redacted
  error?: string          // Error message if failed
  retryAfterMs?: number   // Retry suggestion for rate limiting
}
```

### Requirement: PII filtering (with limitations)

The content script SHALL filter personally identifiable information before returning content.

**IMPORTANT**: This is best-effort filtering. PII filtering cannot filter:

- Password field values (not in textContent/innerText)
- Hidden form data
- Content loaded before content script execution

#### Scenario: PII detected in content

- **WHEN** PII patterns (emails, phone numbers, credit cards, etc.) are detected in textContent
- **THEN** they SHALL be replaced with `[REDACTED]`
- **AND** the `filtered` flag SHALL be set to `true`

#### Scenario: What CAN be filtered

- **WHEN** textContent contains: email addresses, phone numbers, credit card-like patterns, specific name formats
- **THEN** they SHALL be redacted with `[REDACTED]`

#### Scenario: What CANNOT be filtered

- **WHEN** the page contains: password input values, hidden fields, dynamically loaded sensitive content
- **THEN** the content script SHALL NOT filter these
- **WHY**: Password values are not accessible via textContent/innerText

#### Scenario: Sensitive input fields in HTML

- **WHEN** extracting content from HTML (not textContent)
- **THEN** any `value` attributes on `<input type="password">` or `<input type="hidden">` SHALL be stripped

### Requirement: WXT Lifecycle Management

The content script SHALL use WXT's context lifecycle API for cleanup.

#### Scenario: Context invalidation

- **WHEN** the extension is reloaded, updated, or disabled
- **THEN** WXT SHALL call `ctx.onInvalidated()` callback
- **AND** all resources (listeners, intervals, timers) SHALL be cleaned up

#### Scenario: WRONG pattern (DO NOT USE)

- **WHEN** implementing content script cleanup
- **THEN** shall NOT use `window.addEventListener('unload', ...)`
- **WHY**: `unload` does NOT fire for extension context invalidation

### Requirement: SPA Navigation Detection

The content script SHALL detect SPA navigation using WXT's built-in events.

#### Scenario: SPA navigation detected

- **WHEN** WXT emits `wxt:locationchange` event
- **THEN** the content script SHALL check if URL actually changed
- **AND** send `tab-domain-changed` message if domain is different

#### Scenario: History API changes (WRONG pattern)

- **WHEN** implementing domain tracking
- **THEN** shall NOT manually monkey-patch `history.pushState` or `history.replaceState`
- **WHY**: Manual patching breaks sites that wrap History API, fails to clean up properly
- **USE**: WXT's `ctx.addEventListener(window, 'wxt:locationchange', ...)` instead
