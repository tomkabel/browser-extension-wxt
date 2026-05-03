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

### Requirement: Connection quality metrics

In development mode (`import.meta.env.DEV`), the extension SHALL log connection quality metrics.

#### Scenario: Metrics logged

- **WHEN** a connection is established in development mode
- **THEN** the extension SHALL log: `selectedCandidateType` (host/srflx/relay), `rtt` (ms), `transportProtocol` (UDP/TCP)
- **AND** SHALL log a warning if using relay transport
