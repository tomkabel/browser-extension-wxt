## ADDED Requirements

### Requirement: ewma-rtt-estimator
The `CommandClient` SHALL maintain an EWMA RTT estimator with `α = 0.125` for the smoothed average and `β = 0.25` for variance. RTO SHALL be computed as `max(rttAvg + 4 * rttVar, 1000)`.

### Requirement: rtt-sampling-on-ack
Each command ACK SHALL carry the original send timestamp (monotonic `performance.now()`). The CommandClient SHALL sample RTT when an ACK arrives and update the estimator.

### Requirement: adaptive-retransmission
The CommandClient SHALL use `getRto()` from the RTT estimator as the retransmission timeout instead of the current fixed 3-second timeout.

#### Scenario: rtt-estimator-convergence
- **WHEN** 10 ACKs arrive with consistent 50ms round-trip time
- **THEN** `getRto()` SHALL converge to approximately `50 + 4 * 12.5 = 100ms` (minimum 1000ms floor)

#### Scenario: rtt-spike-adaptation
- **WHEN** RTT spikes from 50ms to 500ms
- **THEN** the estimator SHALL adjust within 5 samples (EWMA α=0.125)
