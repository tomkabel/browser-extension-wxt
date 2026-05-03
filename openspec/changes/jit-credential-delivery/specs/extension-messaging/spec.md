## ADDED Requirements

### Requirement: Credential request message flow

The system SHALL support a credential request flow from content script detection through background routing to the phone and back.

#### Flow 5: Credential Request (NEW)

```
Content Script (login field detected)
    → browser.runtime.sendMessage({ type: 'detect-login-form', payload: { domain, url, usernameSelector, passwordSelector, formAction } })
    → Background handler stores field selectors, updates popup state
    → Popup displays "Login detected on <domain>"

Background (auto-triggers on detection, no user popup interaction required)
    → browser.runtime.sendMessage({ type: 'credential-request', payload: { domain, url, usernameFieldId, passwordFieldId } })
    → Background handler
    → commandClient.sendCredentialRequest(payload)
    → Noise-encrypted credential request via data channel
    → Phone decrypts, looks up vault, returns micro-payload
    → commandClient.handleIncomingResponse() resolves
    → Background sends credential-response to content script
    → Content script auto-injects into DOM, zeros buffers
    → Popup displays "Credentials filled"
```

#### Scenario: Credential request dispatched via command client

- **WHEN** the `credential-request` handler receives a payload
- **THEN** it SHALL dispatch via `commandClient.sendCredentialRequest()`
- **AND** SHALL return `{ success: false, error: 'Command client not connected' }` if no active data channel
