## Context

The CommandClient in `lib/channel/commandClient.ts` implements a simple ACK/retry protocol: send message → wait for ACK → retry up to 3 times on failure. There is no RTT estimation, no adaptive timeout, no heartbeat, and no backpressure. The `resilient-transport` change covers ICE candidate waterfall, TURN fallback, and connection re-establishment, but not data channel protocol reliability.

## Goals / Non-Goals

**Goals:**
- EWMA RTT estimation for adaptive retransmission timeout
- 15-second heartbeat ping/pong with 3-strike failure detection
- SCTP ordered delivery with `maxPacketLifetime: 3000`
- Backpressure-aware queuing when `bufferedAmount > 64KB`
- All changes backward compatible with existing phone app

**Non-Goals:**
- Changing the Noise protocol layer
- SCTP partial reliability or unordered delivery
- Multipath or redundant data channels

## Decisions

### Decision 1: EWMA RTT estimation

```typescript
class RttEstimator {
  private rttAvg = 200;  // Initial estimate: 200ms
  private rttVar = 100;  // Initial variance
  private readonly alpha = 0.125;  // EWMA smoothing factor
  private readonly beta = 0.25;    // Variance smoothing factor

  updateRtt(sample: number): void {
    this.rttVar = (1 - this.beta) * this.rttVar + this.beta * Math.abs(sample - this.rttAvg);
    this.rttAvg = (1 - this.alpha) * this.rttAvg + this.alpha * sample;
  }

  getRto(): number {
    return Math.max(this.rttAvg + 4 * this.rttVar, 1000);  // At least 1s
  }
}
```
Each ACK carries the original send timestamp for RTT sampling. The RTO (retransmission timeout) is used instead of the current fixed 3s timeout.

### Decision 2: Heartbeat protocol

Send `{ type: "ping", seq: monotonicCounter, ts: performance.now() }` on the data channel every 15 seconds. The peer responds with `{ type: "pong", echoSeq: seq, ts: original.ts }`. If 3 consecutive pings go unacknowledged, the transport declares the connection dead and triggers `TransportManager.switchTransport()`.

The heartbeat is a new command type in the CommandClient protocol (not a separate data channel). This ensures it benefits from the same encryption, sequencing, and ACK logic.

### Decision 3: SCTP ordered delivery

```typescript
const dataChannel = peerConnection.createDataChannel("noise", {
  ordered: true,
  maxPacketLifetime: 3000,  // 3s retransmit limit
});
```
`ordered: true` ensures messages are delivered in the order sent (critical for command sequencing). `maxPacketLifetime: 3000` prevents stale retransmissions from being delivered after a timeout.

### Decision 4: Backpressure-aware queuing

```typescript
class BackpressureQueue {
  private queue: Uint8Array[] = [];
  private readonly HIGH_WATER_MARK = 64 * 1024;  // 64KB
  private draining = false;

  async send(payload: Uint8Array, dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount > this.HIGH_WATER_MARK) {
      this.queue.push(payload);
      if (!this.draining) await this.drain(dc);
    } else {
      dc.send(payload);
    }
  }

  private async drain(dc: RTCDataChannel): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      if (dc.bufferedAmount < this.HIGH_WATER_MARK / 2) {
        dc.send(this.queue.shift()!);
      }
      await new Promise(r => setTimeout(r, 50));  // Poll every 50ms
    }
    this.draining = false;
  }
}
```
This prevents overwhelming the SCTP association during burst command scenarios (e.g., multiple rapid credential requests).

## Risks / Trade-offs

- [Risk] RTT estimator converges slowly on initial packets — Mitigation: use TCP-style initial RTO (1s) for first 5 samples, then switch to EWMA.
- [Risk] Heartbeat adds 2 messages every 15s per connection — ~0.13 msg/s, negligible overhead.
- [Risk] `maxPacketLifetime: 3000` drops packets after 3s of retransmission — The CommandClient ACK/retry already has a 3-attempt limit. If SCTP drops the packet, the application-level retry handles it.
