## ADDED Requirements

### Requirement: settings-panel-in-popup
The popup SHALL have a Settings panel accessible via a gear icon in the header. The Settings panel SHALL list all approved domains.

### Requirement: revoke-domain-action
Each approved domain in the settings list SHALL have a "Revoke" button. Revoking SHALL call `chrome.scripting.unregisterContentScripts({ ids: [...] })` and remove the domain from `chrome.storage.sync`.

#### Scenario: revoke-domain
- **WHEN** the user taps "Revoke" on a domain in Settings
- **THEN** the dynamic content script for that domain SHALL be unregistered and the domain SHALL be removed from the approved list

#### Scenario: revoke-then-revisit
- **WHEN** the user revokes a domain and then visits its login page
- **THEN** the permission prompt SHALL appear again (same as first visit)
