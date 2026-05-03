## Purpose

version: 1.1.0

Define the message protocol and data flows between the content script, background service worker, and popup components.
## Requirements
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

**MODIFICATION**: Added Flow 4 (Transaction Verification) with real command-client dispatch replacing the stub implementation.
**MODIFICATION**: Added Flow 5 (Credential Request) for Phase 1 JIT website password delivery from phone vault.
**MODIFICATION**: Added Flow 6 (V6 PIN Authorization) for Smart-ID PIN release — PIN is decrypted locally in NDK enclave, not transmitted.

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
    → Content script injects into DOM, zeros buffers
    → Popup displays "Credentials filled"
```

#### Scenario: Transaction verification stub replaced

- **WHEN** the `verify-transaction` handler receives a payload
- **THEN** it SHALL dispatch via `commandClient.sendAuthenticateTransaction()`
- **AND** SHALL NOT return `{ verdict: 'confirmed' }` without phone-side input
- **AND** SHALL return `{ success: false, error: 'Command client not connected' }` if no active data channel

#### Scenario: Credential request dispatched via command client

- **WHEN** the `credential-request` handler receives a payload
- **THEN** it SHALL dispatch via `commandClient.sendCredentialRequest()`
- **AND** SHALL return `{ success: false, error: 'Command client not connected' }` if no active data channel

#### Flow 6: V6 PIN Authorization (V6 — Smart-ID PIN)

```
Background (after zkTLS proof + WebAuthn assertion obtained)
    → browser.runtime.sendMessage({ type: 'pin-authorization', payload: { zkTlsProof, webauthnAssertion, origin, code, nonce } })
    → Background handler
    → AOA/WebRTC transport → Android Vault
    → Java Orchestrator: verify zkTLS proof, recompute Challenge, verify WebAuthn assertion
    → NDK Enclave: decrypt Smart-ID PIN from AndroidKeyStore into mlock buffer
    → PIN→coordinate mapper → float[x,y][] output
    → Ghost Actuator: dispatchGesture()
    → { success: true, data: { outcome: 'completed'|'signed' } } response
    → Popup displays "Smart-ID PIN authorized" or "QES signature completed"
```

**V6 Distinction:** Unlike Flow 5 (Phase 1 credential request), Flow 6 never transmits PIN digits or credential strings. The PIN is decrypted locally in the NDK enclave and only anonymous `float[x,y]` coordinates leave the enclave.

#### Scenario: PIN authorization dispatched

- **WHEN** the `pin-authorization` handler receives a payload
- **THEN** it SHALL dispatch via the active transport (AOA primary, WebRTC fallback)
- **AND** the Android Vault SHALL NOT return PIN digits — only verification status + execution outcome
- **AND** SHALL return `{ success: false, error: 'Phone not connected' }` if no transport is available

## Changelog

| Version | Date | Change | Source |
|---------|------|--------|--------|
| 1.0.0 | 2026-05-01 | Initial spec — popup/content/background messaging, domain tracking, message registry | `fix-tab-domain-detection` |
| 1.0.1 | 2026-05-01 | Fixed initial domain load detection; updated health endpoint and API fallback | `fix-domain-detection` |
| 1.1.0 | 2026-05-01 | Added Flow 4 (real transaction dispatch), Flow 5 (credential request), Flow 6 (V6 PIN authorization) | `architectural-security-remediation` |
