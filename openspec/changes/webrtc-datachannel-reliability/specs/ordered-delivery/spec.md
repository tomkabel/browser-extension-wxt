## ADDED Requirements

### Requirement: sctp-ordered-delivery
The WebRTC data channel SHALL be created with `ordered: true` and `maxPacketLifeTime: 3000`.
`ordered: true` ensures message delivery order matches send order (critical for command
sequencing). `maxPacketLifeTime: 3000` prevents stale retransmissions from being delivered
after the application-level ACK/retry has already timed out and retried.

### Requirement: sctp-configuration-location
The data channel creation with these parameters SHALL be in
`entrypoints/offscreen-webrtc/main.ts` at the point where `peerConnection.createDataChannel()`
is called.

#### Scenario: ordered-delivery-guarantee
- **WHEN** commands A, B, C are sent in sequence over the data channel
- **THEN** they SHALL be delivered to the peer in order A, B, C (never B before A)

#### Scenario: stale-retransmission-prevention
- **WHEN** a packet is retransmitted by SCTP for more than 3 seconds
- **THEN** SCTP SHALL drop the packet (maxPacketLifetime expiry)
- **AND** the application-level CommandClient ACK/retry SHALL handle the retransmission
