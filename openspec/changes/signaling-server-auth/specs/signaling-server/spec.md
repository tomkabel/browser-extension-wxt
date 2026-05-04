## MODIFIED Requirements

### Requirement: register-room-event
- The server SHALL accept a `register-room` event from the room creator containing `{ sasCode, nonce, extensionStaticKey, roomId, capabilities }`
- The `capabilities` field SHALL contain `{ protocolVersion: number, features: string[], supportedTransports: string[] }`
- The server SHALL store these in the room metadata (in-memory Map)

### Requirement: join-commitment-verification
- The server SHALL check `socket.handshake.query.commitment` against the computed `SHA-256(extensionStaticKey + nonce + sasCode)` from room metadata
- **WHEN** commitment is missing or invalid
- **THEN** `socket.join(roomId)` SHALL NOT be called and the server SHALL emit `{ error: 'invalid_commitment' }` to the socket

### Requirement: capabilities-relay
- **WHEN** a peer joins a room with a valid commitment
- **THEN** the server SHALL relay the room creator's capabilities to the joining peer
- **AND** the joining peer SHALL send its own capabilities in the response
- **AND** both peers SHALL negotiate to the intersection of their capabilities

### Requirement: prometheus-metrics-endpoint
- The server SHALL expose `GET /metrics` returning Prometheus-format metrics
- **WHEN** a client connects to the WebSocket server
- **THEN** the `signaling_connections_total` counter SHALL be incremented
- **WHEN** a room transitions from `pairing` to `paired` (both peers connected)
- **THEN** the `signaling_pairing_duration_seconds` histogram SHALL observe the elapsed time
- **WHEN** an ICE candidate exchange fails
- **THEN** the `signaling_ice_failures_total` counter SHALL be incremented

### Requirement: structured-json-logging
- The server SHALL emit all log messages as JSON objects with keys: `timestamp`, `level`, `message`, `requestId`
- **WHEN** any server event occurs
- **THEN** the log line SHALL be a single JSON object per line (newline-delimited JSON)

### Requirement: room-lifecycle
- **WHEN** the extension disconnects (room creator leaves)
- **THEN** the room metadata SHALL be purged within 30 seconds (existing TTL)
- **AND** the `signaling_pairing_duration_seconds` histogram SHALL record the elapsed time if pairing completed
- All clients in the room SHALL be disconnected
