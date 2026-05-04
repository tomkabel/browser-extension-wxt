## 1. Add Benchmark Dependencies

- [ ] 1.1 Install `tinybench` as dev dependency: `bun add -d tinybench`

## 2. Create Noise Handshake Benchmark

- [ ] 2.1 Create `performance/noise-handshake.bench.ts`: run 100 XX handshakes using `createXXHandshake(true)` and `createXXHandshake(false)`
- [ ] 2.2 Run 100 IK handshakes using `createIKHandshake()`
- [ ] 2.3 Report p50/p95/p99 latency from `tinybench` results
- [ ] 2.4 Assert p95 < 200ms for XX, p95 < 150ms for IK

## 3. Create Encryption Throughput Benchmark

- [ ] 3.1 Create `performance/encryption-throughput.bench.ts`: `encryptMessage()`/`decryptMessage()` with 1KB, 64KB, 1MB payloads
- [ ] 3.2 Use `NoiseSession` with pre-established handshake for benchmarking
- [ ] 3.3 Report operations/second and p95 latency
- [ ] 3.4 Assert budgets: 1KB < 1ms, 64KB < 5ms, 1MB < 50ms

## 4. Create CommandClient Throughput Benchmark

- [ ] 4.1 Create `performance/command-client.bench.ts`: create `CommandClient` with mock transport
- [ ] 4.2 Send 1000 sequential `sendCommand({ type: 'ping' })` calls
- [ ] 4.3 Track: total time, sequence gaps, retry count
- [ ] 4.4 Assert throughput > 100 msg/s and zero sequence gaps

## 5. Create Memory Pressure Benchmark

- [ ] 5.1 Create `performance/memory-pressure.bench.ts`: simulate 1000 credential request/inject cycles
- [ ] 5.2 Each cycle: receive mock credential buffer → extract username/password → set DOM values → zero buffer
- [ ] 5.3 Measure `process.memoryUsage().heapUsed` before and after
- [ ] 5.4 Assert delta < 10MB total (10KB per cycle)
- [ ] 5.5 Verify buffer is zeroed after each cycle with `buffer.every(b => b === 0)`

## 6. Add CI Benchmark Job

- [ ] 6.1 Add CI job in `.github/workflows/test.yml`: `bun run vitest --run performance/ --reporter=json`
- [ ] 6.2 Record baseline results to `performance/baseline.json`
- [ ] 6.3 Benchmark step fails if any budget is exceeded

## 7. Final Verification

- [ ] 7.1 Run `bun run vitest --run performance/` — all benchmarks pass
- [ ] 7.2 Verify budgets are calibrated against CI runner (adjust if needed)
