## ADDED Requirements

### Requirement: Popup to content script messaging

The popup SHALL send requests directly to the content script for content extraction.

#### Scenario: Popup requests content extraction

- **WHEN** user clicks the refresh button or content panel loads
- **THEN** the popup SHALL query the active tab using `browser.tabs.query({ active: true, currentWindow: true })`
- **AND** send a message `{ type: 'read-dom', payload: { maxLength: 50000 } }` to that tab's content script

#### Scenario: Popup handles content script response

- **WHEN** the content script returns extracted content
- **THEN** the popup SHALL receive the `ScrapeResult` data and display it
- **AND** make it available for API submission

### Requirement: Popup to background messaging

The popup SHALL communicate with the background for domain state and API calls.

#### Scenario: Popup requests current domain

- **WHEN** the DomainPanel loads or tab changes
- **THEN** the popup SHALL send `{ type: 'get-current-domain', payload: null }` to background
- **AND** background SHALL resolve tabId from popup's `sender.tab.id`

#### Scenario: Popup requests API health check

- **WHEN** the ApiPanel loads
- **THEN** the popup SHALL send `{ type: 'check-api-health', payload: null }` to background

#### Scenario: Popup sends data to API

- **WHEN** user clicks "Send Data to API" button
- **THEN** the popup SHALL send `{ type: 'send-to-api', payload: { content, metadata } }` to background
- **AND** background SHALL relay to external API

### Requirement: Content script to background messaging (Domain Tracking)

**CRITICAL FIX**: Content script SHALL use `browser.runtime.sendMessage`, NOT `browser.tabs.sendMessage`.

#### Scenario: Content script reports domain change (CORRECT)

- **WHEN** the content script detects a URL change via WXT's `wxt:locationchange`
- **THEN** it SHALL send `{ type: 'tab-domain-changed', payload: { domain, url } }` via `browser.runtime.sendMessage`
- **AND** background SHALL receive it with `sender.tab.id` automatically populated

#### Scenario: WRONG pattern (DO NOT USE)

- **WHEN** implementing domain tracking in content script
- **THEN** shall NOT use `browser.tabs.sendMessage(tab.id, { type: 'tab-domain-changed', ... })`
- **WHY**: This sends to content scripts on the tab, NOT the background

### Requirement: End-to-end message flow

The system SHALL support these complete flows:

#### Flow 1: Domain Detection (CORRECTED)

```
Content Script (wxt:locationchange event)
    → browser.runtime.sendMessage({ type: 'tab-domain-changed', ... })
    → Background (sender.tab.id auto-populated)
    → TabStateManager.updateTabDomain
    → Storage (session:${tabId}:domain)
```

#### Flow 2: Content Extraction

```
Popup (loadContent)
    → browser.tabs.query({ active: true, currentWindow: true })
    → browser.tabs.sendMessage(tabId, { type: 'read-dom' })
    → Content Script (uses document.location directly, NOT tabs.query)
    → ScrapeResult response
    → Popup (display content)
```

#### Flow 3: API Submission

```
Popup (sendToApi)
    → browser.runtime.sendMessage({ type: 'send-to-api' })
    → Background (ApiRelay.send)
    → External API (CORS-free)
    → { success, data/error } response
    → Popup (display status)
```

### Requirement: Message type registry

All message types SHALL be documented:

| Type                      | Direction            | Payload                 | Response                                   | Notes                              |
| ------------------------- | -------------------- | ----------------------- | ------------------------------------------ | ---------------------------------- |
| `get-current-domain`      | Popup → Background   | `null`                  | `{ success, data: TabDomainState, error }` | Resolves tabId from sender         |
| `tab-domain-changed`      | Content → Background | `{ domain, url }`       | `{ success, error }`                       | **FIXED**: Use runtime.sendMessage |
| `send-to-api`             | Popup → Background   | `{ content, metadata }` | `{ success, data, error }`                 |                                    |
| `check-api-health`        | Popup → Background   | `null`                  | `{ success, data, error }`                 |                                    |
| `read-dom`                | Popup → Content      | `{ maxLength }`         | `ScrapeResult`                             |                                    |
| `get-structured-content`  | Popup → Content      | `null`                  | `ScrapeResult`                             | Deprecated: identical to read-dom  |
| `content-script-unloaded` | Content → Background | `null`                  | (no response)                              | Optional: for cleanup              |

### Requirement: Handle message errors

- **WHEN** a message step fails (no tab, no content script, etc.)
- **THEN** the error SHALL be caught and returned with a meaningful message
- **AND** the popup SHALL display the error to the user

### Requirement: Background tabId resolution

The background SHALL resolve tabId from the message sender context, not from the payload.

#### Scenario: getTabIdFromSender (CORRECT)

```typescript
async function getTabIdFromSender(sender: browser.Runtime.MessageSender): Promise<number | null> {
  // Always use sender.tab.id — do NOT fallback to tabs.query
  return sender.tab?.id ?? null
}
```

#### Scenario: WRONG pattern (DO NOT USE)

```typescript
// WRONG: Fallback to tabs.query creates cross-tab contamination bug
async function getTabIdFromSender(sender) {
  if (sender?.tab?.id) return sender.tab.id
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true }) // WRONG
  return tab?.id ?? null
}
```

### Requirement: Message routing type safety

The system SHALL use typed message handlers.

**NOTE**: Current implementation uses string-based routing with `as` casts. For production, consider `@webext-core/messaging` for proper type safety.

#### Current (acceptable for MVP)

```typescript
const handlers: Record<string, MessageHandler> = {
  'tab-domain-changed': async (payload) => {
    const { domain, url } = payload as { domain: string; url: string }
    // ...
  },
}
```

#### Recommended (for type safety)

```typescript
// Use @webext-core/messaging or webext-bridge
import { createSender } from '@webext-core/messaging'

const sendDomainChange = createSender<DomainChangePayload, BackgroundResponse>(...)
```
