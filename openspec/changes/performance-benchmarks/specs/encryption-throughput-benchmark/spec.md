## ADDED Requirements

### Requirement: encryption-throughput-1kb
The `performance/encryption-throughput.bench.ts` SHALL benchmark `encryptMessage()` and `decryptMessage()` with 1KB payloads. Budget: p95 encrypt < 1ms, p95 decrypt < 1ms.

### Requirement: encryption-throughput-64kb
Benchmark with 64KB payloads. Budget: p95 encrypt < 5ms, p95 decrypt < 5ms.

### Requirement: encryption-throughput-1mb
Benchmark with 1MB payloads. Budget: p95 encrypt < 50ms, p95 decrypt < 50ms.

#### Scenario: all-encryption-budgets
- **WHEN** encryption throughput benchmark completes for all payload sizes
- **THEN** all p95 budgets SHALL be met
