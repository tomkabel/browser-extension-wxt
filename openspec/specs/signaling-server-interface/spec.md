# signaling-server-interface Specification

## Purpose

Define the wire protocol and API contract between the browser extension, Android companion app, and the signaling server. The signaling server is a separate deployable artifact (`signaling-server/` in this repo). This spec defines its external behavior so that extension and Android development are independent of signaling server internals.

## Requirements

### Requirement: Signaling server relays SDP and ICE candidates

The signaling server SHALL provide a Socket.IO-based relay for WebRTC handshake messages (SDP offers/answers, ICE candidates) between paired peers, AND serve ephemeral TURN credentials via an HTTP endpoint.

#### Scenario: Socket.IO connection

- **WHEN** either peer connects to the signaling server via Socket.IO (`io("wss://<host>")`)
- **THEN** the server SHALL accept the connection
- **AND** SHALL support the `websocket` transport
- **AND** SHALL support polling transport as fallback

#### Scenario: Room join with SAS code

- **WHEN** a peer emits `join-room` with a SAS code
- **THEN** the server SHALL validate the format (6-digit numeric OR 3-emoji)
- **AND** SHALL create or join the room `smartid2::<sasCode>`
- **AND** SHALL emit `room-joined` with `{ peerCount, turnCredentials? }`

#### Scenario: Room join with invalid SAS code

- **WHEN** a peer emits `join-room` with an invalid SAS code (wrong format or empty)
- **THEN** the server SHALL emit `error` with `{ message: 'Invalid room code' }`

#### Scenario: SDP relay

- **WHEN** a peer emits `sdp-offer(sasCode, offer)`
- **THEN** the server SHALL relay the offer to all other peers in the room via `sdp-offer`
- **WHEN** a peer emits `sdp-answer(sasCode, answer)`
- **THEN** the server SHALL relay the answer to all other peers via `sdp-answer`

#### Scenario: ICE candidate relay

- **WHEN** a peer emits `ice-candidate(sasCode, candidate)`
- **THEN** the server SHALL relay the candidate to all other peers in the room via `ice-candidate`

#### Scenario: Room timeout

- **WHEN** all peers have disconnected from a room
- **THEN** the server SHALL clean up the room after 30 seconds
- **AND** a new `join-room` with the same SAS code SHALL create a fresh room

### Requirement: Ephemeral TURN credential provisioning

The signaling server SHALL serve time-limited TURN credentials via an HTTP endpoint, allowing the WebRTC client to configure ICE with relay servers.

#### Scenario: Client requests TURN credentials

- **WHEN** either peer sends `GET /turn-credentials` with header `x-room-id: smartid2::<sasCode>`
- **THEN** the server SHALL generate HMAC-SHA1 credentials:
  - username = `${timestamp}:${roomId}`
  - password = `HMAC-SHA1(TURN_SECRET, username)` base64-encoded
  - TTL = 300 seconds
- **AND** respond with `{ username, password, ttl, urls: string[], stunUrls: string[] }`

#### Scenario: TURN_SECRET not configured

- **WHEN** TURN_SECRET environment variable is not set on the signaling server
- **THEN** `GET /turn-credentials` SHALL return HTTP 503
- **AND** the extension SHALL operate without TURN (local-only ICE)

#### Scenario: Non-WebSocket fallback for TURN credentials

- **WHEN** a client cannot establish a Socket.IO connection (CORS, firewall)
- **THEN** the client MAY still fetch TURN credentials via plain HTTP GET `/turn-credentials`
- **AND** use those credentials to configure a separate `RTCPeerConnection`

### Requirement: Health check endpoint

The signaling server SHALL expose a health check endpoint.

#### Scenario: Health check

- **WHEN** `GET /` is requested
- **THEN** the server SHALL respond with `{ status: 'ok', rooms: <count> }`
- **AND** HTTP status 200

### Requirement: SAS code format compatibility

The signaling server SHALL support both numeric (6-digit) and emoji (3-character) SAS codes for room addressing, to maintain backward compatibility during the transition.

#### Scenario: Numeric SAS code

- **WHEN** a peer joins with `join-room("123456")`
- **THEN** the room SHALL be `smartid2::123456`
- **AND** all relay operations SHALL work identically

#### Scenario: Emoji SAS code

- **WHEN** a peer joins with `join-room("🚀🎸🥑")`
- **THEN** the room SHALL be `smartid2::🚀🎸🥑`
- **AND** all relay operations SHALL work identically
