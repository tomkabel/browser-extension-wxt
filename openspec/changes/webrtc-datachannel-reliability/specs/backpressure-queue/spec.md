## ADDED Requirements

### Requirement: high-water-mark-threshold
The `WebRtcTransport` SHALL monitor `dataChannel.bufferedAmount`. When it exceeds 64KB, outgoing commands SHALL be queued instead of sent immediately.

### Requirement: queue-drain-logic
The queue SHALL drain when `bufferedAmount` drops below 32KB (half the high-water mark). Drain polling SHALL occur every 50ms.

### Requirement: queue-ordering
Messages in the queue SHALL be sent in FIFO order. The command sequence number SHALL be assigned at queue entry time (not send time) to maintain ordering guarantees.

#### Scenario: backpressure-prevents-overflow
- **WHEN** many commands are sent rapidly (e.g., 50 credential requests in 1 second)
- **THEN** no command SHALL be sent when `bufferedAmount > 64KB`; they SHALL be queued and drained gradually

#### Scenario: queue-empties-completely
- **WHEN** all queued commands have been sent
- **THEN** `bufferedAmount` SHALL return below 32KB within 500ms
