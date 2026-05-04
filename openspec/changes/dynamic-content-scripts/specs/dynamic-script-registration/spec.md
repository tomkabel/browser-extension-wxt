## ADDED Requirements

### Requirement: chrome-scripting-dynamic-registration
The extension SHALL use `chrome.scripting.registerContentScripts()` to inject content scripts on user-approved domains. Scripts SHALL have `persistAcrossSessions: true`.

### Requirement: startup-re-registration
On background script startup, the extension SHALL iterate `chrome.storage.sync` approved domains and re-register any content scripts that were cleared by Chrome (scripts are cleared on extension update).

### Requirement: minimal-footprint-dynamic-script
The dynamically registered content script SHALL be a minimal bundle containing only credential detection and injection logic — NOT the full transaction-scraping module.

#### Scenario: dynamic-script-injects-on-approved-domain
- **WHEN** the user navigates to an approved domain
- **THEN** the dynamic content script SHALL be active and SHALL detect login forms on that domain

#### Scenario: script-survives-extension-restart
- **WHEN** the browser is restarted
- **THEN** the approved domain scripts SHALL be re-registered and active
