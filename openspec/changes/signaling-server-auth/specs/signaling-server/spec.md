## MODIFIED Requirements

### Requirement: register-room-event
- The server SHALL accept a `register-room` event from the room creator containing `{ sasCode, nonce, extensionStaticKey, roomId }`
- The server SHALL store these in the room metadata (in-memory Map)

### Requirement: join-commitment-verification
- The server SHALL check `socket.handshake.query.commitment` against the computed `SHA-256(extensionStaticKey + nonce + sasCode)` from room metadata
- **WHEN** commitment is missing or invalid
- **THEN** `socket.join(roomId)` SHALL NOT be called and the server SHALL emit `{ error: 'invalid_commitment' }` to the socket

### Requirement: room-lifecycle
- **WHEN** the extension disconnects (room creator leaves)
- **THEN** the room metadata SHALL be purged within 30 seconds (existing TTL)
- All clients in the room SHALL be disconnected
