## Context

The WXT browser extension currently fails to:

1. Detect the active domain (failing on lhv.ee)
2. Extract innerText from the current page
3. Send extracted data via REST API

Additionally, the implementation has critical security flaws and architectural bugs that would prevent Chrome Web Store approval.

## Goals / Non-Goals

**Goals:**

- Fix critical messaging architecture bug (domain tracker sends to itself)
- Fix content script self-querying bug (uses tabs.query instead of document.location)
- Implement proper WXT lifecycle management (ctx.onInvalidated instead of window.unload)
- Remove KeepAlive anti-pattern — accept MV3 ephemeral service worker model
- Use `optional_host_permissions` for runtime permission requests
- Use PSL-based domain parsing instead of naive string splitting

**Non-Goals:**

- Adding `tabs` or `scripting` permissions — `activeTab` is sufficient
- Using `<all_urls>` host permission — scope to specific target domains
- PII filtering on password fields — acknowledge it cannot work
- Keeping the service worker alive artificially — accept the lifecycle

## Security Constraints

For a banking-adjacent extension (lhv.ee), the following are **NEVER acceptable**:

1. `<all_urls>` in host_permissions — use specific domains or `optional_host_permissions`
2. `tabs` permission — `activeTab` grants temporary tab access without "browsing history" warning
3. KeepAlive alarms — Chrome MV3 explicitly discourages this; it doesn't work
4. Naive domain parsing — `blog.co.uk` would parse incorrectly without PSL

## Decisions

### 1. Content Script Registration

**Decision**: Register content script with specific target domains.

**Rationale**:

- `activeTab` grants temporary access when user clicks the extension
- Content script can read page content when active
- No need for `<all_urls>` or `tabs` permission

**Implementation**:

```typescript
export default defineContentScript({
  matches: ['*://*.lhv.ee/*', '*://*.example.com/*'],
  runAt: 'document_idle', // Not document_end
})
```

### 2. Domain Tracking Flow (FIXED)

**Decision**: Content script sends domain changes via `runtime.sendMessage`, not `tabs.sendMessage`.

**Flow** (CORRECT):

```
Content Script (detects URL change via History API or WXT locationchange)
    → browser.runtime.sendMessage({ type: 'tab-domain-changed', payload: {...} })
    → Background (receives with sender.tab.id populated)
    → TabStateManager.updateTabDomain
```

**Previous Bug**: Used `browser.tabs.sendMessage(tab.id, ...)` which delivers to content script in that tab, NOT background.

### 3. Content Extraction (FIXED)

**Decision**: Content script uses `document.location` directly, not `tabs.query`.

**Rationale**:

- Content script is already scoped to one tab
- No need to query for its own tab ID
- Avoids race conditions if user switches tabs during async scrape

**Implementation**:

```typescript
// WRONG (old):
const [tab] = await browser.tabs.query({ active: true, currentWindow: true })

// CORRECT (new):
const url = document.location.href
const domain = document.location.hostname
```

### 4. WXT Lifecycle Management (FIXED)

**Decision**: Use WXT's `ctx.onInvalidated()` instead of `window.unload`.

**Rationale**:

- `window.unload` does NOT fire for extension context invalidation
- `ctx.onInvalidated()` is called when extension reloads/updates
- `ctx.addEventListener()` automatically cleans up on context invalidation

**Implementation**:

```typescript
export default defineContentScript({
  main(ctx) {
    ctx.onInvalidated(() => {
      // Clean up resources here
      // This IS called on extension reload/update
    })

    // Use ctx.addEventListener for automatic cleanup
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      // Handle SPA navigation
    })
  },
})
```

### 5. SPA Navigation Detection

**Decision**: Use WXT's built-in `wxt:locationchange` event, not manual History API patching.

**Rationale**:

- WXT monkey-patches History API internally and emits `wxt:locationchange`
- Manual patching breaks sites that already wrap History API
- WXT's approach properly cleans up on context invalidation

**Implementation**:

```typescript
ctx.addEventListener(window, 'wxt:locationchange', () => {
  const url = document.location.href
  // Send to background via runtime.sendMessage
})
```

### 6. Service Worker Lifetime

**Decision**: Do NOT attempt to keep service worker alive. Accept ephemeral lifecycle.

**Rationale**:

- MV3 service workers die after ~30 seconds of inactivity
- Chrome explicitly discourages KeepAlive alarms
- For long operations: use offscreen documents
- For API calls: use retry with proper error handling, chunk work if needed

**Implementation**:

- REMOVE keepAlive.ts entirely
- For API calls >30s: use offscreen document with document.createPolicy
- Accept that some operations may fail and implement proper retry

## Message Flow (CORRECTED)

### Flow 1: Domain Detection

```
Content Script (WXT locationchange event)
    → browser.runtime.sendMessage({ type: 'tab-domain-changed', ... })
    → Background (receives with sender.tab.id populated)
    → TabStateManager.updateTabDomain
    → Storage
```

### Flow 2: Content Extraction

```
Popup (loadContent)
    → browser.runtime.sendMessage({ type: 'get-current-domain' })  // No tabId needed in payload
    → Background (resolves tabId from sender.tab of the popup's own message)
    → Returns stored domain

Popup (loadContent)
    → browser.tabs.query({ active: true, currentWindow: true })  // From popup context only
    → browser.tabs.sendMessage(tabId, { type: 'read-dom' })
    → Content Script (scrapePage uses document.location directly)
    → ScrapeResult response
    → Popup (display content)
```

### Flow 3: API Submission

```
Popup
    → browser.runtime.sendMessage({ type: 'send-to-api', payload: { content, metadata } })
    → Background (ApiRelay.send with 30s timeout)
    → External API (CORS-free)
    → { success, data/error } response
    → Popup (display status)
```

## Error Handling

- **Tab not ready**: Check `tab.status !== 'complete'` before sending
- **Content script not loaded**: Catch "Could not establish connection" error
- **Timeout**: 5 second timeout on sendMessage wrapped in Promise.race
- **Rate limiting**: Implemented at content script level with backoff
- **Service worker dead**: Background auto-restarts on next message; popup retries

## PII Filtering Limitations

The extension extracts `document.body.innerText` which does NOT include password field values. PII filtering can only work on visible text content, not on input values. The spec acknowledges:

1. **What CAN be filtered**: Email addresses, phone numbers, credit card numbers (with limitations), names in specific formats
2. **What CANNOT be filtered**: Password field values, hidden form data, content loaded via JavaScript before content script execution

For a banking extension, content extraction should be used cautiously. Consider:

- Only extracting specific non-sensitive elements (headings, links)
- Not scraping full page text on banking sites
- Using structured extraction (specific selectors) instead of full innerText

## Implementation Notes

### Tab Detection

- From popup: Use `browser.tabs.query({ active: true, currentWindow: true })`
- From content script: Use `document.location` directly — no query needed
- From background: Use `sender.tab.id` from message sender context

### Content Extraction

- Returns `ScrapeResult` with: `success`, `text`, `headings`, `linkCount`, `imageCount`, `filtered`, `error`, `retryAfterMs`
- Uses `document_idle` timing for dynamic content
- PII filtering is best-effort, not security guarantee

### Service Worker Lifetime

- No KeepAlive module
- API calls have 30s timeout
- Long operations (>30s) use offscreen documents
- Service worker may die during operations — implement proper retry

### Tab State Storage

- Keyed by `tabId` in session storage
- Cleans up via `tabs.onRemoved` listener
- Does NOT use in-memory Map that persists across service worker restarts
