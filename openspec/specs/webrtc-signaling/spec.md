version: 1.1.0

## MODIFIED Requirements

### Requirement: WebRTC data channel transport with ICE candidate waterfall

The extension and phone SHALL use a WebRTC data channel as the transport layer. DTLS 1.2 encryption is mandatory. ICE SHALL attempt connection in a waterfall: local host candidates first, then TURN/UDP relay, then TURN/TCP 443 relay.

#### Scenario: Data channel establishment

- **WHEN** both peers connect to the signaling server
- **AND** exchange SDP offers/answers via Socket.IO relay
- **THEN** a WebRTC data channel SHALL be established
- **AND** the data channel SHALL use DTLS 1.2 encryption
- **AND** ICE SHALL attempt connection in this order: local host candidates, TURN/UDP relay, TURN/TCP 443 relay
- **AND** the extension SHALL fetch ephemeral TURN credentials from the signaling server before creating the `RTCPeerConnection`

#### Scenario: Local connection succeeds

- **WHEN** both devices are on the same local network
- **AND** mDNS host candidates are discovered
- **THEN** the connection SHALL be established using a local candidate pair
- **AND** no TURN relay traffic SHALL be generated

#### Scenario: Local fails, TURN/UDP succeeds

- **WHEN** no local candidate pair establishes within 3 seconds
- **THEN** the ICE agent SHALL attempt TURN/UDP relay candidates
- **AND** the connection SHALL be established via the TURN relay

#### Scenario: TURN/UDP fails, TURN/TCP 443 succeeds

- **WHEN** TURN/UDP allocation fails or times out within 5 seconds
- **THEN** the ICE agent SHALL attempt TURN/TCP on port 443
- **AND** the connection SHALL be established via TCP relay

### Requirement: Signaling server SDP relay and TURN credential provision

A minimal Socket.IO server SHALL relay SDP offers/answers and ICE candidates between peers, AND provide ephemeral TURN credentials.

#### Scenario: SDP relay

- **WHEN** the extension sends an SDP offer to room `smartid2::<sas-code>`
- **THEN** the signaling server SHALL relay the offer to the phone in the same room
- **AND** the phone SHALL respond with an SDP answer relayed back

#### Scenario: TURN credential provision

- **WHEN** a client requests `GET /turn-credentials` with a valid room ID
- **THEN** the signaling server SHALL return time-limited (5 minute) TURN credentials
- **AND** the credentials SHALL be HMAC-derived using a shared secret between server and TURN instance
- **AND** the response SHALL include `{ username, password, ttl, urls: [...] }`

### Requirement: Cached pairing state

After successful pairing, both sides SHALL cache the peer's static key.

#### Scenario: Chrome storage

- **WHEN** pairing succeeds
- **THEN** the extension SHALL store the phone's static public key in `chrome.storage.session`
- **AND** the phone SHALL store the extension's static public key in `EncryptedSharedPreferences`

## Changelog

| Version | Date | Change | Source |
|---------|------|--------|--------|
| 1.0.0 | 2026-05-01 | Initial spec — WebRTC data channel with DTLS, SDP relay, cached pairing state | `secure-pairing` |
| 1.1.0 | 2026-05-01 | Added ICE candidate waterfall (local → TURN/UDP → TURN/TCP 443) and TURN credential fetch | `resilient-transport` |
