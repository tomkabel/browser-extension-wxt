## MODIFIED Requirements

### Requirement: End-to-end message flow

The system SHALL support these complete flows:

**MODIFICATION**: Added Flow 4 (Transaction Verification) with real command-client dispatch replacing the stub implementation.

#### Flow 1: Domain Detection

```
Content Script (main() startup)
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

#### Flow 4: Transaction Verification (MODIFIED)

```
Popup (handleVerify)
    → browser.runtime.sendMessage({ type: 'verify-transaction', payload })
    → Background handler
    → commandClient.sendAuthenticateTransaction(payload)
    → encodeMessage() → sendData() via data channel
    → Phone receives, processes, returns ControlResponse
    → offscreen-webrtc onmessage → handleIncomingResponse()
    → pending.get(seq) → entry.resolve(response)
    → { success: true, data: { verdict: 'confirmed'|'rejected' } } response
    → Popup displays result
```

#### Scenario: Transaction verification stub replaced

- **WHEN** the `verify-transaction` handler receives a payload
- **THEN** it SHALL dispatch via `commandClient.sendAuthenticateTransaction()` 
- **AND** SHALL NOT return `{ verdict: 'confirmed' }` without phone-side input
- **AND** SHALL return `{ success: false, error: 'Command client not connected' }` if no active data channel
