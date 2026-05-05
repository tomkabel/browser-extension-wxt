## ADDED Requirements

### Requirement: WebSocket signaling connection

The app SHALL connect to the signaling server at the configured URL via socket.io WebSocket transport.

#### Scenario: Connect to signaling server
- **WHEN** the app starts with a signalling server URL configured
- **THEN** it SHALL establish a socket.io WebSocket connection
- **AND** it SHALL emit `join-room` event with SAS code within 5 seconds of connection

### Requirement: WebRTC peer connection

The app SHALL create an RTCPeerConnection using `react-native-webrtc` when it receives an SDP offer from the extension.

#### Scenario: Accept SDP offer
- **WHEN** the signaling server relays an SDP offer from the extension to the phone
- **THEN** the app SHALL create an RTCPeerConnection
- **AND** SHALL call `setRemoteDescription(offer)`
- **AND** SHALL create and send an SDP answer via the signaling server

#### Scenario: ICE candidate exchange
- **WHEN** the app receives an ICE candidate from the extension via the signaling server
- **THEN** it SHALL add the candidate to the RTCPeerConnection via `addIceCandidate()`
- **AND** it SHALL forward its own ICE candidates via the signaling server

### Requirement: Data channel lifecycle

The app SHALL open a WebRTC data channel with `ordered: true` for Noise protocol messages.

#### Scenario: Data channel opens
- **WHEN** the RTCPeerConnection negotiation completes
- **THEN** a data channel SHALL open with `ordered: true` and `id: 0`
- **AND** the app SHALL notify the Noise responder that the transport is ready

#### Scenario: Data channel closes
- **WHEN** the data channel closes unexpectedly
- **THEN** the app SHALL attempt reconnection with exponential backoff (1s, 2s, 4s, … 30s max)
- **AND** SHALL notify the user of the disconnected state

#### Scenario: Data channel fragmentation (SCTP message > 64KB)
- **WHEN** a Noise message exceeds the SCTP max message size (typically 64KB on Android)
- **THEN** the app SHALL NOT send the message directly
- **AND** SHALL split the payload into chunks of 16KB or less
- **AND** prefix each chunk with a sequence number
- **AND** reassemble chunks on the receiving side before passing to the Noise transport

### Requirement: Signaling server unreachable

The app SHALL handle signaling server connection failure gracefully.

#### Scenario: Server DNS resolution failure
- **WHEN** the signaling server URL cannot be resolved (no network, VPN disconnected)
- **THEN** the app SHALL display "Cannot reach pairing server — check internet connection"
- **AND** SHALL retry connection every 5 seconds for up to 2 minutes
- **AND** after 2 minutes, SHALL display a persistent error with a manual "Retry" button

#### Scenario: TURN credential fetch fails
- **WHEN** the endpoint `/turn-credentials` returns HTTP 500 or times out
- **THEN** the app SHALL proceed with STUN-only ICE candidates (no TURN relay)
- **AND** the connection SHALL still succeed if both peers are on the same LAN or have symmetric NAT that STUN can traverse
- **AND** SHALL display a non-blocking warning: "Relay server unavailable — direct connection may fail on some networks"

#### Scenario: Room join rejected
- **WHEN** the signaling server rejects the `join-room` event (e.g., SAS expired or room full)
- **THEN** the app SHALL display "Pairing code expired — please generate a new QR code"
- **AND** SHALL return to the QR scanner screen
