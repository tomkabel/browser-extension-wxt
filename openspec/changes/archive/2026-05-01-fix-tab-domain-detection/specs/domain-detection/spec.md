## ADDED Requirements

### Requirement: Active tab domain detection

The system SHALL detect the active tab's URL using the `sender.tab.id` from message context, not `tabs.query`.

#### Scenario: Successfully detect active tab domain

- **WHEN** the popup requests domain
- **THEN** the background script SHALL return the active tab's URL domain using stored tab state keyed by `sender.tab.id`

#### Scenario: Handle missing sender tab

- **WHEN** the message sender does not have `tab.id` available
- **THEN** the system SHALL return an error "Cannot identify sender tab"
- **AND** shall NOT fall back to querying the active tab

#### Scenario: Handle no active tab

- **WHEN** there is no active tab in the current window
- **THEN** the system SHALL return an error "No active tab"

#### Scenario: Handle tab domain not yet recorded

- **WHEN** the popup requests domain but no domain has been recorded for the current tab
- **THEN** the system SHALL return an error "No domain recorded for this tab"

### Requirement: Tab state storage and retrieval

The system SHALL store and retrieve tab domain information.

#### Scenario: Domain stored on navigation

- **WHEN** the content script detects a URL change
- **THEN** it SHALL send `tab-domain-changed` message via `browser.runtime.sendMessage` to background
- **AND** the background SHALL store the domain state keyed by `sender.tab.id`

#### Scenario: Domain retrieval

- **WHEN** `get-current-domain` message is received
- **THEN** the background SHALL retrieve stored domain state for the sending tab's `sender.tab.id`
- **AND** return `{ success: true, data: { domain, registrableDomain, isPublic, timestamp } }`

### Requirement: Manifest permission configuration

The wxt.config.ts SHALL use minimal permissions.

#### Scenario: Current manifest permissions

- **WHEN** the extension is built
- **THEN** the generated manifest.json SHALL include `storage`, `activeTab`, `alarms` in the permissions array
- **AND** shall NOT include `tabs` or `scripting` permissions

#### Scenario: Host permissions

- **WHEN** the extension needs access to specific domains
- **THEN** it SHALL use `optional_host_permissions` with runtime request
- **AND** target domains like `*://*.lhv.ee/*` shall be requested on first use

### Requirement: Domain tracking via runtime.sendMessage

The content script SHALL send domain changes via `browser.runtime.sendMessage`, not `browser.tabs.sendMessage`.

#### Scenario: Content script reports domain change (CORRECT)

- **WHEN** the content script detects a URL change (via WXT's `wxt:locationchange` or History API check)
- **THEN** it SHALL call `browser.runtime.sendMessage({ type: 'tab-domain-changed', payload: { domain, url } })`
- **AND** background SHALL receive the message with `sender.tab.id` populated automatically

#### Scenario: WRONG pattern (DO NOT USE)

- **WHEN** implementing domain tracking
- **THEN** shall NOT use `browser.tabs.sendMessage(tabId, ...)`
- **WHY**: `tabs.sendMessage` delivers to content scripts on that tab, NOT the background

### Requirement: Domain parsing with PSL

The system SHALL use the Public Suffix List (PSL) for domain parsing, not naive string splitting.

#### Scenario: Parse subdomain

- **WHEN** parsing `blog.co.uk`
- **THEN** registrableDomain SHALL be `co.uk` (correct per PSL)
- **AND** subdomain SHALL be `blog`

#### Scenario: Parse standard domain

- **WHEN** parsing `www.example.com`
- **THEN** registrableDomain SHALL be `example.com`
- **AND** subdomain SHALL be `www`

#### Scenario: Parse complex subdomain

- **WHEN** parsing `api.example.co.uk`
- **THEN** registrableDomain SHALL be `example.co.uk` ( PSL-aware)
- **AND** subdomain SHALL be `api`
