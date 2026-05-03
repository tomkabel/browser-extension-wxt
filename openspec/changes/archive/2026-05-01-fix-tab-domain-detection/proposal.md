## Why

The WXT browser extension is failing to detect the active domain (specifically on lhv.ee), failing to extract innerText from the current page, and failing to send this data via a REST API. The extension throws "Cannot read properties of undefined (reading 'query')".

## What Changes

- Fix content script self-messaging bug — domain tracker must use `runtime.sendMessage`, not `tabs.sendMessage`
- Fix content script architecture — use `document.location` directly instead of `tabs.query`
- Implement robust active tab detection using `sender.tab.id` from message context
- Use WXT lifecycle API (`ctx.onInvalidated`) instead of `window.unload` for cleanup
- Use `document_idle` for content script timing
- Remove KeepAlive anti-pattern — accept ephemeral service worker lifecycle
- Remove PII filtering (theatrical security) or acknowledge limitations
- Use `optional_host_permissions` for runtime permission requests

## Security Constraints

1. **NEVER use `<all_urls>`** — scope to specific target domains
2. **NEVER use `tabs` permission** — `activeTab` is sufficient for popup-to-content communication
3. **NEVER use KeepAlive** — service workers are ephemeral by design
4. **Acknowledge PII filtering limitations** — password fields cannot be filtered from innerText
5. **Use PSL for domain parsing** — naive string splitting fails on `blog.co.uk`

## Capabilities

### New Capabilities

- `domain-detection`: Detect active tab domain using sender context (not tabs.query)
- `content-extraction`: Extract page content via content scripts with proper WXT lifecycle
- `extension-messaging`: Correct message-passing flow: Content → Background (not Content → Content)
- `error-handling`: Handle tab readiness and content script scenarios with timeout support

### Modified Capabilities

## Impact

- `entrypoints/content/index.ts`: Content extraction with WXT ctx lifecycle, no tabs.query
- `entrypoints/content/domainTracker.ts`: Fixed to use `runtime.sendMessage` to reach background
- `entrypoints/background/messageHandlers.ts`: Use sender.tab.id from message context
- `entrypoints/popup/panels/ContentPanel.tsx`: Direct content extraction via sender tab ID
- `entrypoints/popup/panels/ApiPanel.tsx`: Shared content state or deduplicated scraping
