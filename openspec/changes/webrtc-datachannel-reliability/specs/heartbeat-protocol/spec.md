## ADDED Requirements

### Requirement: heartbeat-command-type
A new `CommandType.Ping` SHALL be added. The heartbeat SHALL reuse the existing CommandClient infrastructure (encryption, sequencing, ACK).

### Requirement: 15-second-heartbeat-interval
The CommandClient SHALL send a ping every 15 seconds when the transport is idle (no other commands in flight).

### Requirement: 3-strike-failure-detection
If 3 consecutive pings go unacknowledged (each using the adaptive RTO for retry), the CommandClient SHALL emit a `transport-dead` event. The `TransportManager` SHALL trigger transport failover on this event.

### Requirement: heartbeat-payload
The ping payload SHALL contain `{ type: "ping", seq: number, ts: number }`. The pong response SHALL contain `{ type: "pong", echoSeq: number, ts: number }`.

#### Scenario: heartbeat-keepalive
- **WHEN** the transport is idle for 16 seconds
- **THEN** at least one heartbeat ping SHALL have been sent

#### Scenario: heartbeat-failure-triggers-failover
- **WHEN** 3 consecutive pings are not answered within the adaptive RTO
- **THEN** the transport SHALL be declared dead and failover SHALL be triggered
