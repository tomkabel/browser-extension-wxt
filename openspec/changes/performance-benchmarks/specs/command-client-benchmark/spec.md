## ADDED Requirements

### Requirement: command-client-sequential-throughput
The `performance/command-client.bench.ts` SHALL benchmark sending 1000 sequential messages with a mock transport. Budget: > 100 messages/second throughput.

### Requirement: sequence-gap-tracking
The benchmark SHALL verify that no sequence gaps occur across all 1000 messages. Any gap SHALL fail the benchmark.

#### Scenario: throughput-budget
- **WHEN** CommandClient throughput benchmark completes
- **THEN** throughput SHALL exceed 100 messages/second
- **THEN** there SHALL be zero sequence gaps
