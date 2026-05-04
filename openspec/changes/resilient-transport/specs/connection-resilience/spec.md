## ADDED Requirements

### Requirement: Connection state machine

The extension SHALL maintain a connection state machine that transitions between `disconnected`, `connecting`, `connected`, and `reconnecting` states.

#### Scenario: Normal connection

- **WHEN** the offscreen WebRTC document is created and `RTCPeerConnection` state is `connected`
- **THEN** the extension connection state SHALL be `connected`

#### Scenario: Connection lost with automatic reconnect

- **WHEN** the connection state changes to `disconnected` or `failed`
- **THEN** the extension SHALL transition to `reconnecting`
- **AND** SHALL attempt to re-establish the connection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **AND** SHALL NOT require user intervention

#### Scenario: Reconnection succeeds

- **WHEN** reconnection succeeds
- **THEN** the extension SHALL re-establish the Noise IK handshake using cached keys
- **AND** the pairing state SHALL remain `paired`

### Requirement: Event-driven USB detection (replaces polling)

The extension SHALL NOT poll for USB availability. Instead, it SHALL listen for push notifications from the Go native host.

#### Scenario: USB device attached via native host push

- **WHEN** the Go native host detects a new AOA-capable USB device
- **THEN** it SHALL send a `{ type: "device-attached", vendor, product }` message via the native messaging port
- **WHEN** the TransportManager receives this message
- **THEN** it SHALL immediately set `usbAvailable = true`
- **AND** initiate a transport switch to USB if currently on WebRTC

#### Scenario: USB device removed

- **WHEN** the Go native host detects a USB device removal
- **THEN** it SHALL send a `{ type: "device-removed" }` message via the native messaging port
- **WHEN** the TransportManager receives this message
- **THEN** it SHALL set `usbAvailable = false`
- **AND** if USB was the active transport, switch to WebRTC

#### Scenario: No native host available (WebRTC-only)

- **WHEN** `chrome.runtime.connectNative` fails (native host not installed)
- **THEN** the TransportManager SHALL use `chrome.idle.onStateChanged` as a heuristic
- **AND** SHALL NOT fall back to polling

### Requirement: Connection quality metrics

In development mode (`import.meta.env.DEV`), the extension SHALL log connection quality metrics.

#### Scenario: Metrics logged

- **WHEN** a connection is established in development mode
- **THEN** the extension SHALL log: `selectedCandidateType` (host/srflx/relay), `rtt` (ms), `transportProtocol` (UDP/TCP)
- **AND** SHALL log a warning if using relay transport

#### Scenario: Static TURN credential fallback active

- **WHEN** the extension uses static TURN credentials (signaling server unreachable)
- **THEN** a warning SHALL be logged: "Using static TURN fallback — signaling server unavailable"
- **AND** connection SHALL proceed normally
