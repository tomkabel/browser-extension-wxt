## MODIFIED Requirements

### Requirement: WebRTC data channel transport

The extension and phone SHALL use a WebRTC data channel as the transport layer. DTLS 1.2 encryption is mandatory.

#### Scenario: Data channel establishment

- **WHEN** both peers connect to the signaling server
- **AND** exchange SDP offers/answers via Socket.IO relay
- **THEN** a WebRTC data channel SHALL be established
- **AND** the data channel SHALL use DTLS 1.2 encryption
- **AND** ICE SHALL attempt connection in this order: local host candidates, TURN/UDP relay, TURN/TCP 443 relay
- **AND** the extension SHALL fetch ephemeral TURN credentials from the signaling server before creating the `RTCPeerConnection`

### Requirement: Signaling server SDP relay

A minimal Socket.IO server SHALL relay SDP offers/answers and ICE candidates between peers, AND provide ephemeral TURN credentials.

#### Scenario: SDP relay

- **WHEN** the extension sends an SDP offer to room `smartid2::<sas-code>`
- **THEN** the signaling server SHALL relay the offer to the phone in the same room
- **AND** the phone SHALL respond with an SDP answer relayed back

#### Scenario: TURN credential provision

- **WHEN** a client requests `GET /turn-credentials` with a valid room ID
- **THEN** the signaling server SHALL return time-limited (5 minute) TURN credentials
- **AND** the credentials SHALL be HMAC-derived using a shared secret between server and TURN instance
