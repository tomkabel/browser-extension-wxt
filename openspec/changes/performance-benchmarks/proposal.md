## Why

The project has no performance baselines for Noise handshake speed, encryption throughput, command client latency, or memory pressure. Without benchmarks, regressions from new features go undetected, and architectural decisions cannot be validated empirically. The `resilient-transport` and `webrtc-datachannel-reliability` changes specifically need throughput baselines to validate their improvements.

## What Changes

Add a `performance/` directory with Vitest benchmark tests using `tinybench`. Cover: Noise XX/IK handshake completion time (100 iterations, p50/p95/p99), `encryptMessage`/`decryptMessage` throughput for 1KB/64KB/1MB payloads, CommandClient throughput with mock transport (1000 sequential messages), and memory pressure simulation (1000 credential request/inject cycles with heap measurement). Add a CI job that runs benchmarks and fails if p95 exceeds defined budgets.

## Capabilities

### New Capabilities
- `noise-handshake-benchmark`: Handshake latency measurement with statistical reporting
- `encryption-throughput-benchmark`: Encrypt/decrypt operations/second for multiple payload sizes
- `command-client-benchmark`: Sequential message throughput with sequence gap tracking
- `memory-pressure-benchmark`: Heap usage after repeated credential request/inject cycles

### Existing Capabilities Modified
- `ci-pipeline`: Add benchmark job with performance budget enforcement
