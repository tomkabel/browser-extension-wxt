## ADDED Requirements

### Requirement: Cross-browser offscreen document polyfill

The extension SHALL provide a polyfill for `chrome.offscreen.createDocument()` for Firefox and Safari, where the offscreen API is not available. The polyfill creates a hidden tab as an alternative execution context for WebRTC and WebUSB operations.

#### Scenario: Chrome — native offscreen document

- **WHEN** the extension runs in Chrome (MV3)
- **AND** `typeof chrome.offscreen?.createDocument === 'function'`
- **THEN** the extension SHALL use the native offscreen API: `chrome.offscreen.createDocument({ url, reasons: ['WEB_RTC'], justification: '...' })`

#### Scenario: Firefox — hidden tab fallback

- **WHEN** `chrome.offscreen` is not available (Firefox, Safari)
- **THEN** the extension SHALL create a hidden tab: `browser.tabs.create({ url: browser.runtime.getURL('offscreen-webrtc.html'), active: false })`
- **AND** communicate with the hidden tab via `browser.runtime.sendMessage` and `browser.runtime.onMessage`
- **AND** the tab SHALL remain open in the background (not user-visible)
- **AND** when the offscreen context is no longer needed, the tab SHALL be closed via `browser.tabs.remove(tabId)`

#### Scenario: Firefox WebRTC data channel in hidden tab

- **WHEN** the hidden tab creates an RTCPeerConnection
- **THEN** the WebRTC data channel SHALL function identically to Chrome's offscreen document
- **AND** the same `webrtc-start-pairing`, `webrtc-send`, and `webrtc-disconnect` message handlers SHALL work

#### Scenario: Firefox WebUSB not available

- **WHEN** the extension attempts WebUSB in Firefox (not supported)
- **THEN** it SHALL gracefully fall back to WebRTC-only transport
- **AND** SHALL NOT attempt to use `navigator.usb`

### Requirement: Tab lifecycle management

The polyfill SHALL manage the hidden tab lifecycle to avoid resource leaks.

#### Scenario: Tab created on demand

- **WHEN** the extension needs an offscreen context (pairing start, WebRTC init)
- **THEN** the polyfill SHALL create the hidden tab
- **AND** register it in the extension's tab state for cleanup

#### Scenario: Tab closed on cleanup

- **WHEN** the offscreen context is no longer needed (pairing complete, transport disconnected)
- **THEN** the polyfill SHALL close the hidden tab via `browser.tabs.remove(tabId)`
- **AND** SHALL clean up all message listeners associated with the tab

#### Scenario: Tab survives service worker restart (Firefox)

- **WHEN** the Firefox service worker restarts (background page restart)
- **THEN** the hidden tab SHALL reconnect to the new background context via `browser.runtime.onConnect`
- **AND** re-establish messaging without creating a new tab
