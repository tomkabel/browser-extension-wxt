## ADDED Requirements

### Requirement: memory-pressure-per-cycle
The `performance/memory-pressure.bench.ts` SHALL simulate 1000 credential request/inject cycles and measure `process.memoryUsage().heapUsed` before and after. Budget: < 10KB heap delta per cycle.

### Requirement: buffer-zeroing-verification
The benchmark SHALL verify that credential buffers are zeroed after each injection cycle. A test helper SHALL check that `decryptedBuffer.every(b => b === 0)` after injection.

#### Scenario: no-memory-leak
- **WHEN** 1000 credential cycles complete
- **THEN** total heap growth SHALL be less than 10MB (1000 cycles × 10KB budget)
