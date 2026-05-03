## ADDED Requirements

### Requirement: WebRTC data channel transport

The extension and phone SHALL use a WebRTC data channel as the transport layer. DTLS 1.2 encryption is mandatory.

#### Scenario: Data channel establishment

- **WHEN** both peers connect to the signaling server
- **AND** exchange SDP offers/answers via Socket.IO relay
- **THEN** a WebRTC data channel SHALL be established
- **AND** the data channel SHALL use DTLS 1.2 encryption
- **AND** ICE SHALL discover host candidates on the same LAN (no TURN needed for local use)

### Requirement: Signaling server SDP relay

A minimal Socket.IO server SHALL relay SDP offers/answers and ICE candidates between peers.

#### Scenario: SDP relay

- **WHEN** the extension sends an SDP offer to room `smartid2::<sas-code>`
- **THEN** the signaling server SHALL relay the offer to the phone in the same room
- **AND** the phone SHALL respond with an SDP answer relayed back

### Requirement: Cached pairing state

After successful pairing, both sides SHALL cache the peer's static key.

#### Scenario: Chrome storage

- **WHEN** pairing succeeds
- **THEN** the extension SHALL store the phone's static public key in `chrome.storage.session`
- **AND** the phone SHALL store the extension's static public key in `EncryptedSharedPreferences`
