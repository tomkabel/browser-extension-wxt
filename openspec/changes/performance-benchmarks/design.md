## Context

The project has no performance baselines. The `resilient-transport` and `webrtc-datachannel-reliability` changes need throughput/latency baselines to validate improvements. The Noise protocol implementation needs verification against expected performance characteristics. Without benchmarks, performance regressions are only caught by user reports.

## Goals / Non-Goals

**Goals:**
- Noise XX handshake benchmark: 100 iterations, p50/p95/p99 latency
- Noise IK handshake benchmark: 100 iterations, p50/p95/p99
- Encryption throughput: encrypt/decrypt 1KB, 64KB, 1MB payloads — ops/second
- CommandClient throughput: 1000 sequential messages, track sequence gaps and retries
- Memory pressure: 1000 credential request/inject cycles, measure heap delta
- CI job that runs benchmarks and enforces performance budget

**Non-Goals:**
- Network-level benchmarks (WebRTC throughput, TURN relay latency)
- Android device benchmarks
- UI rendering benchmarks (popup paint time)

## Decisions

### Decision 1: Vitest + tinybench

Use `tinybench` as the benchmark runner within Vitest. Tinybench integrates naturally with the existing Vitest test infrastructure and provides statistical reporting (mean, median, p95, p99).

```typescript
import { Bench } from 'tinybench';

it('noise XX handshake', async () => {
  const bench = new Bench({ time: 100 });
  bench.add('XX handshake', async () => {
    const alice = createXXHandshake(true);
    const bob = createXXHandshake(false);
    // ... full handshake
  });
  await bench.run();
  expect(bench.tasks[0]!.result!.p95).toBeLessThan(200); // 200ms budget
});
```

### Decision 2: Performance budget in CI

```yaml
# .github/workflows/test.yml addition
- name: Performance benchmarks
  run: bun run vitest --run performance/ --reporter=json
```

| Metric | Budget (p95) |
|---|---|
| Noise XX handshake | < 200ms |
| Noise IK handshake | < 150ms |
| Encrypt 1KB | < 1ms |
| Encrypt 64KB | < 5ms |
| Encrypt 1MB | < 50ms |
| CommandClient throughput | > 100 msg/s |
| Memory per credential cycle | < 10KB delta |

Budget violations fail the CI step.

### Decision 3: Isolated `performance/` directory

Benchmarks live in `performance/` at the project root, separate from unit tests. They use the same Vitest config but are run with `--run performance/` to avoid slowing down the main test suite. The directory structure:
```
performance/
  noise-handshake.bench.ts
  encryption-throughput.bench.ts
  command-client.bench.ts
  memory-pressure.bench.ts
```

## Risks / Trade-offs

- [Risk] CI runners may be slower than development machines — The budgets should be calibrated against the CI runner baseline. Run benchmarks once on CI, record baselines in a `performance/baseline.json`, and compare against that.
- [Risk] Tinybench warmup iterations may mask cold-start performance — Separate "cold" (first run, no warmup) and "warm" (after 10 iterations) benchmarks.
- [Risk] Memory measurement in Node.js is imprecise — Use `process.memoryUsage().heapUsed` before and after the test cycle. Accept that GC timing may cause variance.
