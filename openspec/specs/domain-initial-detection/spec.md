## ADDED Requirements

### Requirement: Domain reported on initial page load

The content script SHALL send a `tab-domain-changed` message immediately upon initialization, not only on SPA navigation changes.

#### Scenario: Content script starts on a matched page

- **WHEN** the content script runs its `main()` function on a page matching the manifest patterns
- **THEN** it SHALL call `browser.runtime.sendMessage({ type: 'tab-domain-changed', payload: { domain: window.location.hostname, url: window.location.href } })`
- **AND** the background SHALL record the domain state for the sender's tab

#### Scenario: Deduplication prevents redundant updates

- **WHEN** the content script sends an initial domain message followed immediately by a `wxt:locationchange` event for the same domain
- **THEN** the background SHALL skip the second update via the existing 1-second cache TTL in `TabStateManager.updateTabDomain`

### Requirement: Content script match patterns include all target domains

The content script SHALL be registered with `matches` covering both `*://*.lhv.ee/*` and `*://*.youtube.tomabel.ee/*`.

#### Scenario: Content script injects on youtube.tomabel.ee

- **WHEN** the user navigates to any page on `youtube.tomabel.ee` or its subdomains
- **THEN** the content script SHALL be injected and operational
