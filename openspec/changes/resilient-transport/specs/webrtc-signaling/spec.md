## MODIFIED Requirements

### Requirement: WebRTC data channel transport

The extension and phone SHALL use a WebRTC data channel as the transport layer. DTLS 1.2 encryption is mandatory. The data channel SHALL be establised via QR-embedded SDP when possible, falling back to signaling server relay.

#### Scenario: Data channel establishment via QR-embedded SDP (primary)

- **WHEN** the extension generates a QR code for pairing
- **THEN** the extension SHALL create an RTCPeerConnection and generate an SDP offer
- **AND** compress the SDP JSON using deflate (pako): `compress(JSON.stringify({ sdp: offer.sdp, type: offer.type }))`
- **AND** encode the compressed SDP in the QR code as a `sdp` query parameter
- **WHEN** the phone scans the QR code
- **THEN** the phone SHALL extract the `sdp` parameter, decompress it, and reconstruct the RTCSessionDescription
- **AND** the phone SHALL create an RTCPeerConnection, set the remote description, and create an answer
- **AND** set the answer as local description, completing the SDP exchange without a signaling server
- **AND** ICE candidates SHALL be exchanged via the established data channel (trickle ICE)

#### Scenario: Data channel establishment via signaling server (fallback)

- **WHEN** QR-embedded SDP fails (ICE timeout after 15 seconds)
- **OR** the QR code does not contain a `sdp` parameter (older extension version)
- **THEN** both peers SHALL connect to the signaling server
- **AND** exchange SDP offers/answers via Socket.IO relay
- **AND** ICE SHALL attempt connection in this order: local host candidates, TURN/UDP relay, TURN/TCP 443 relay
- **AND** the extension SHALL fetch ephemeral TURN credentials from the signaling server before creating the `RTCPeerConnection`

#### Scenario: WebRTC Perfect Negotiation roles

- **WHEN** both peers have established a data channel via QR-embedded SDP
- **THEN** the extension SHALL act as the **polite peer** — on SDP conflict, roll back its local description and await the impolite peer's offer
- **AND** the phone SHALL act as the **impolite peer** — on SDP conflict, keep its local description and signal the polite peer

### Requirement: Signaling server SDP relay

A minimal Socket.IO server SHALL relay SDP offers/answers and ICE candidates between peers (as fallback), AND provide ephemeral TURN credentials.

#### Scenario: SDP relay (fallback only)

- **WHEN** the signaling server is used as fallback (QR-embedded SDP failed)
- **AND** the extension sends an SDP offer to room `smartid2::<sas-code>`
- **THEN** the signaling server SHALL relay the offer to the phone in the same room
- **AND** the phone SHALL respond with an SDP answer relayed back

#### Scenario: TURN credential provision

- **WHEN** a client requests `GET /turn-credentials` with a valid room ID
- **THEN** the signaling server SHALL return time-limited (5 minute) TURN credentials
- **AND** the credentials SHALL be HMAC-derived using a shared secret between server and TURN instance
- **AND** if the signaling server is unreachable, the client SHALL use static embedded TURN credentials as fallback
