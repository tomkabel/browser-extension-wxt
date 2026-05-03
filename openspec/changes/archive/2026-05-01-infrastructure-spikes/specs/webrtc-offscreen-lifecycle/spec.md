## ADDED Requirements

### Requirement: Offscreen document supports WEB_RTC reason

The extension SHALL create an offscreen document with `offscreenReason: 'WEB_RTC'` for RTCPeerConnection.

#### Scenario: Offscreen document creation

- **WHEN** the extension calls `chrome.offscreen.createDocument({ reasons: ['WEB_RTC'], url: 'offscreen.html' })`
- **THEN** the document SHALL be created successfully
- **AND** `RTCPeerConnection` SHALL be constructable within the offscreen document

### Requirement: Data channel survives service worker restart

The WebRTC data channel SHOULD remain functional after the service worker terminates and restarts.

#### Scenario: Data channel message after service worker restart

- **WHEN** the extension creates an offscreen document with RTCPeerConnection
- **AND** the service worker terminates due to inactivity (~30s)
- **AND** a new event wakes the service worker
- **THEN** the offscreen document SHALL be checked for existence (recreated if destroyed)
- **AND** the RTCPeerConnection SHALL be checked for connectivity
- **AND** data channel messages SHALL still flow

### Requirement: SW port keepalive strategy

The extension SHALL implement a keepalive strategy using `runtime.connect` ports to prevent premature service worker termination while WebRTC is active.

#### Scenario: Popup keeps SW alive via runtime.connect

- **WHEN** the popup opens
- **AND** WebRTC connection is active
- **THEN** the popup SHALL establish a `runtime.connect({ name: 'webrtc-keepalive' })` port
- **AND** the service worker SHALL stay alive while the port is connected
- **AND** closing the popup SHALL disconnect the port, allowing SW to terminate normally

### Requirement: Popup-connection fallback

If offscreen document cannot be kept alive, the extension SHALL support creating RTCPeerConnection directly from the popup.

#### Scenario: Popup creates RTCPeerConnection

- **WHEN** the popup opens
- **AND** no offscreen document strategy succeeds
- **THEN** the popup SHALL create RTCPeerConnection directly
- **AND** closing the popup SHALL terminate the connection
