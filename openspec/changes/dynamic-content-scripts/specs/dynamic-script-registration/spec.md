## ADDED Requirements

### Requirement: universal-content-script-matching
The content script SHALL be registered with `matches: ["*://*/*"]` in `wxt.config.ts`, replacing the previous hardcoded domain list. The script SHALL NOT rely on any hardcoded domain constant.

### Requirement: self-destruct-on-non-login-pages
The content script SHALL self-destruct if no password field is detected within 3 seconds of page load, using `chrome.scripting.unregisterContentScripts`.

#### Scenario: self-destruct-on-regular-page
- **WHEN** the user navigates to a page without a password field (e.g., news article)
- **THEN** the content script SHALL start a 3-second timer
- **AND** if no password field is detected before the timer fires
- **THEN** the script SHALL call `chrome.scripting.unregisterContentScripts({ ids: [selfId] })`
- **AND** SHALL clean up the MutationObserver and all listeners

#### Scenario: self-destruct-cancelled-by-login-form
- **WHEN** a password field is detected before the 3-second timer fires
- **THEN** the self-destruct timer SHALL be cancelled
- **AND** the script SHALL continue running for credential auto-fill

#### Scenario: self-destruct-reset-on-dom-mutation
- **WHEN** DOM mutations occur within the 3-second window (SPA slowly rendering)
- **THEN** the self-destruct timer SHALL be reset (extended by another 3 seconds)
- **AND** the script SHALL continue waiting for a password field

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
