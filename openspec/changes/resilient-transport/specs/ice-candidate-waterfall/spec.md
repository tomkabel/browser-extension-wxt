## ADDED Requirements

### Requirement: ICE candidate waterfall ordering

The WebRTC `RTCPeerConnection` SHALL be configured to try local candidates first, then TURN relay candidates, without user intervention.

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

### Requirement: Connection establishment without user errors

The extension SHALL NOT display connection error messages to the user during the ICE waterfall process.

#### Scenario: All ICE candidates fail

- **WHEN** all local and relay candidates fail after 15 seconds
- **THEN** the extension SHALL display "Unable to connect. Check your network and try again."
- **AND** provide a "Retry" button
- **AND** SHALL NOT display technical ICE error details

#### Scenario: Connection succeeds after fallback

- **WHEN** the connection succeeds after falling back to TURN relay
- **THEN** the user SHALL NOT see any error or warning
- **AND** the connection SHALL function identically to a local connection
