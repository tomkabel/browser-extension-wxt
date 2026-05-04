## ADDED Requirements

### Requirement: noise-xx-benchmark
The `performance/noise-handshake.bench.ts` SHALL run 100 full Noise XX handshakes and report p50/p95/p99 latency. Budget: p95 < 200ms.

### Requirement: noise-ik-benchmark
The performance suite SHALL run 100 Noise IK handshakes and report p50/p95/p99 latency. Budget: p95 < 150ms.

#### Scenario: noise-handshake-budget
- **WHEN** Noise XX handshake benchmark completes
- **THEN** p95 latency SHALL be less than 200ms
