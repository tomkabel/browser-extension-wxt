## ADDED Requirements

### Requirement: Unified Transport interface

The browser extension SHALL define a `Transport` interface that abstracts over USB (Native Messaging) and WebRTC transports for seamless switching.

#### Scenario: Transport interface definition

- **WHEN** the extension initializes its connection layer
- **THEN** it SHALL use a `Transport` interface with:
  - `type: 'usb' | 'webrtc'`
  - `connect(): Promise<void>`
  - `disconnect(): Promise<void>`
  - `send(payload: Uint8Array): Promise<void>`
  - `onMessage(callback: (data: Uint8Array) => void): void`
  - `onDisconnect(callback: () => void): void`
  - `getLatency(): Promise<number>`
  - `isAvailable(): boolean`

#### Scenario: USB Transport implementation

- **WHEN** a USB transport is requested
- **THEN** the extension SHALL create a `UsbTransport` that wraps `chrome.runtime.sendNativeMessage`
- **AND** `connect()` SHALL send a `{ "type": "connect" }` message to the native host
- **AND** `send()` SHALL base64-encode the payload and send `{ "type": "send-payload", "data": "<base64>" }`
- **AND** `onMessage()` SHALL listen for native host messages of type `"payload-received"`
- **AND** `getLatency()` SHALL measure round-trip time via a ping/pong message to the native host

#### Scenario: WebRTC Transport implementation

- **WHEN** USB is unavailable and WebRTC is the fallback
- **THEN** the extension SHALL create a `WebRtcTransport` that uses the existing data channel infrastructure
- **AND** all `Transport` interface methods SHALL map to the existing WebRTC signalling/ICE/data channel primitives

### Requirement: TransportManager for automatic transport selection

The extension SHALL provide a `TransportManager` that selects the best available transport based on device presence and quality metrics.

#### Scenario: Preference for USB transport

- **WHEN** the TransportManager initializes
- **THEN** it SHALL attempt to connect via USB transport first
- **AND** if USB connect succeeds, use USB as the active transport
- **AND** mark the WebRTC transport as standby (connected but idle)

#### Scenario: Fallback to WebRTC

- **WHEN** USB transport is unavailable (native host not installed, no device tethered, connect fails)
- **THEN** the TransportManager SHALL fall back to WebRTC transport
- **AND** continuously poll USB availability at 2-second intervals
- **AND** if USB becomes available, switch to USB transport seamlessly

#### Scenario: Switch from WebRTC to USB during active session

- **WHEN** USB becomes available while WebRTC is the active transport
- **THEN** the TransportManager SHALL connect via USB
- **AND** once USB is connected, send a single empty message via WebRTC to flush pending data
- **AND** atomically switch the active transport to USB
- **AND** leave the WebRTC transport connected as a hot standby

#### Scenario: Degraded USB triggers fallback

- **WHEN** the active USB transport reports degraded performance (timeout, disconnect, high latency)
- **THEN** the TransportManager SHALL immediately activate the standby WebRTC transport
- **AND** notify the extension UI of the transport change
- **AND** continue monitoring USB for recovery

### Requirement: Transport status reporting

The extension SHALL report transport status to the popup UI for user awareness.

#### Scenario: Display active transport in popup

- **WHEN** the popup renders the connection panel
- **THEN** it SHALL display the active transport type ("USB" or "WebRTC") with a status indicator
- **AND** USB transport SHALL show a tethered device icon with serial number (if available)
- **AND** WebRTC transport SHALL show a network latency indicator

#### Scenario: Transport change notification

- **WHEN** the active transport changes (USB → WebRTC or WebRTC → USB)
- **THEN** the TransportManager SHALL emit a `'transport-changed'` event
- **AND** the popup SHALL update the transport indicator within 200ms
- **AND** an unobtrusive toast notification SHALL appear for 3 seconds

### Requirement: Modified existing capabilities

Existing capabilities SHALL be updated to be transport-aware.

#### Scenario: Offscreen document lifecycle is transport-aware

- **WHEN** the offscreen document manages keepalive for the data channel
- **THEN** it SHALL NOT terminate the document during an active USB session (even if WebRTC is idle)
- **AND** it SHALL continue polling USB availability from the background script
- **AND** it SHALL only terminate when BOTH transports are disconnected

#### Scenario: Signaling server remains active for WebRTC standby

- **WHEN** USB is the active transport
- **THEN** the WebRTC signaling connection SHALL remain active as a hot standby
- **AND** ICE candidates SHALL continue to be gathered for the standby connection
- **AND** the TURN/STUN infrastructure SHALL remain available for fallback

### Requirement: Native host availability detection

The extension SHALL detect whether the native messaging host is installed and functional.

#### Scenario: Check native host availability

- **WHEN** the TransportManager starts
- **THEN** it SHALL attempt to call `chrome.runtime.sendNativeMessage('org.smartid.aoa_host', { type: 'ping' })`
- **AND** if the call succeeds, mark `usbAvailable = true`
- **AND** if the call fails (host not installed, not registered), mark `usbAvailable = false`
- **AND** cache the result and re-check at 30-second intervals
- **AND** note that the TransportManager uses two separate polling mechanisms: a 2-second interval to poll physical USB device presence (hot-plug responsiveness, via `chrome.runtime.sendNativeMessage('org.smartid.aoa_host', { type: 'ping' })` to detect when a device is tethered) and a 30-second interval to check the native host installation/running state (host availability changes infrequently, so the longer interval suffices)

#### Scenario: Handle native host crash/restart

- **WHEN** the native host process terminates unexpectedly
- **THEN** the extension SHALL detect the termination via message channel close
- **AND** mark USB as unavailable
- **AND** seamlessly fall back to WebRTC
- **AND** attempt to restart the native host on the next USB connect attempt (Chrome auto-restarts Native Messaging hosts)
