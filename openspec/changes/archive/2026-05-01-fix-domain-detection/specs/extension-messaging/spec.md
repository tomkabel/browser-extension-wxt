## MODIFIED Requirements

### Requirement: Content script to background messaging (Domain Tracking)

**CRITICAL FIX**: Content script SHALL use `browser.runtime.sendMessage`, NOT `browser.tabs.sendMessage`.

#### Scenario: Content script reports domain change (CORRECT)

- **WHEN** the content script detects a URL change via WXT's `wxt:locationchange`
- **THEN** it SHALL send `{ type: 'tab-domain-changed', payload: { domain, url } }` via `browser.runtime.sendMessage`
- **AND** the background SHALL receive it with `sender.tab.id` automatically populated

#### Scenario: Content script reports initial domain on startup

- **WHEN** the content script runs its `main()` function on a matched page
- **THEN** it SHALL immediately send `{ type: 'tab-domain-changed', payload: { domain, url } }` via `browser.runtime.sendMessage`
- **AND** the background SHALL record the domain state for the sender's tab

#### Scenario: WRONG pattern (DO NOT USE)

- **WHEN** implementing domain tracking in content script
- **THEN** shall NOT use `browser.tabs.sendMessage(tab.id, { type: 'tab-domain-changed', ... })`
- **WHY**: This sends to content scripts on the tab, NOT the background

### Requirement: End-to-end message flow

The system SHALL support these complete flows:

#### Flow 1: Domain Detection (INITIAL LOAD FIX)

```
Content Script (main() startup)
    → browser.runtime.sendMessage({ type: 'tab-domain-changed', ... })
    → Background (sender.tab.id auto-populated)
    → TabStateManager.updateTabDomain
    → Storage (session:${tabId}:domain)

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
