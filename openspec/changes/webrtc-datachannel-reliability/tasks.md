## 1. Implement RTT Estimator

- [ ] 1.1 Create `RttEstimator` class in `lib/channel/rttEstimator.ts`:
  - `updateRtt(sample: number): void` — EWMA update (α=0.125, β=0.25)
  - `getRto(): number` — return `max(rttAvg + 4 * rttVar, 1000)`
  - Initial `rttAvg = 200`, `rttVar = 100`
- [ ] 1.2 Unit test: RTT estimator converges to actual RTT within 10 samples
- [ ] 1.3 Unit test: RTO floor is 1000ms
- [ ] 1.4 Unit test: RTT spike causes RTO increase within 5 samples

## 2. Integrate RTT into CommandClient

- [ ] 2.1 Add `timestamp` field to command ACK protocol: ACK carries original send timestamp
- [ ] 2.2 In `commandClient.ts`: on ACK receipt, compute RTT sample = `now - ack.timestamp`, call `rttEstimator.updateRtt(sample)`
- [ ] 2.3 Replace fixed 3s retransmission timeout with `rttEstimator.getRto()`
- [ ] 2.4 Update `sendCommand()` to use adaptive RTO for each retry attempt
- [ ] 2.5 Unit test: `sendCommand` uses adaptive RTO
- [ ] 2.6 Unit test: command succeeds with one retry using adaptive timeout

## 3. Implement Heartbeat Protocol

- [ ] 3.1 Add `CommandType.Ping` and `CommandType.Pong` to `types/commands.ts`
- [ ] 3.2 In `commandClient.ts`: start 15s interval timer when transport is idle
- [ ] 3.3 Ping sends `{ type: "ping", seq, ts }`; peer responds with `{ type: "pong", echoSeq, ts }`
- [ ] 3.4 Track consecutive missed pings; after 3, emit `transport-dead` event
- [ ] 3.5 In `WebRtcTransport.ts`: listen for `transport-dead`, call `TransportManager.switchTransport('usb', 'WebRTC heartbeat failure')`
- [ ] 3.6 Unit test: idle transport sends ping within 16 seconds
- [ ] 3.7 Unit test: 3 missed pings trigger `transport-dead` event

## 4. Implement Backpressure Queue

- [ ] 4.1 Create `BackpressureQueue` class in `lib/channel/backpressureQueue.ts`:
  - `send(payload: Uint8Array, dc: RTCDataChannel): Promise<void>` — queues or sends based on `bufferedAmount`
  - HIGH_WATER_MARK = 64KB, drain threshold = 32KB, poll interval = 50ms
- [ ] 4.2 Integrate into `WebRtcTransport.send()`: wrap `dataChannel.send()` with `BackpressureQueue`
- [ ] 4.3 Unit test: queue buffers messages when `bufferedAmount > 64KB`
- [ ] 4.4 Unit test: queue drains completely within 500ms of drain start

## 5. Configure SCTP Ordered Delivery

- [ ] 5.1 In `entrypoints/offscreen-webrtc/main.ts`: configure data channel with `{ ordered: true, maxPacketLifetime: 3000 }`
- [ ] 5.2 Add comments documenting the ordered delivery guarantee

## 6. Final Verification

- [ ] 6.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 6.2 Benchmark: CommandClient throughput > 100 msg/s (verify existing performance)
