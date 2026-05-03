## ADDED Requirements

### Requirement: TURN server deployment

The project SHALL deploy a production TURN server (coturn) configured with UDP 3478 and TCP 443 listeners, using ephemeral HMAC-based credential authentication.

#### Scenario: TURN server accepts connections

- **WHEN** a WebRTC peer sends a TURN allocate request with valid ephemeral credentials
- **THEN** the TURN server SHALL accept the allocation
- **AND** relay data between the two peers in the same room

#### Scenario: TCP 443 fallback

- **WHEN** UDP traffic is blocked by a firewall
- **THEN** the TURN server SHALL accept relay connections on TCP port 443
- **AND** the connection SHALL be indistinguishable from standard HTTPS to DPI systems

#### Scenario: Ephemeral credential expiry

- **WHEN** a TURN credential exceeds its 5-minute TTL
- **THEN** the TURN server SHALL reject further allocations using that credential
- **AND** the client SHALL fetch new credentials from the signaling server

### Requirement: Signaling server provides TURN credentials

The signaling server SHALL expose a `/turn-credentials` endpoint that returns time-limited TURN server credentials.

#### Scenario: Credential fetch

- **WHEN** the offscreen WebRTC document requests `GET /turn-credentials`
- **THEN** the signaling server SHALL return `{ username, password, ttl, urls: [...] }`
- **AND** the username SHALL be an HMAC of `{timestamp}:{roomId}`
- **AND** the password SHALL be the base64-encoded HMAC output
