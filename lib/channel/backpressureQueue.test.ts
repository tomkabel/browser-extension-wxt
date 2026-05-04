import { describe, it, expect, vi } from 'vitest';
import { BackpressureQueue } from '~/lib/channel/backpressureQueue';
import { RttEstimator } from '~/lib/channel/rttEstimator';

function createMockDc(
  bufferedAmount = 0,
  readyState: RTCDataChannelState = 'open',
): RTCDataChannel {
  const listeners = new Map<string, Array<() => void>>();
  return {
    bufferedAmount,
    readyState,
    bufferedAmountLowThreshold: 0,
    send: vi.fn(),
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      const cbs = listeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(cb);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    }),
    close: vi.fn(),
  } as unknown as RTCDataChannel;
}

function fireBufferedAmountLow(dc: RTCDataChannel): void {
  const cb = (dc.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: unknown[]) => c[0] === 'bufferedamountlow',
  );
  if (cb) cb[1]();
}

describe('BackpressureQueue', () => {
  it('sends directly when bufferedAmount is below high-water mark', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(1000);
    const payload = new Uint8Array([1, 2, 3]);

    await queue.send(payload, dc);

    expect(dc.send).toHaveBeenCalled();
    expect(queue.getQueueLength()).toBe(0);
  });

  it('sends directly when total pending equals high-water mark exactly', async () => {
    const hwm = 64 * 1024;
    const queue = new BackpressureQueue(hwm);
    const dc = createMockDc(hwm);
    const payload = new Uint8Array(0);

    await queue.send(payload, dc);

    expect(dc.send).toHaveBeenCalled();
    expect(queue.getQueueLength()).toBe(0);
  });

  it('throws when data channel is not open', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(0, 'closed');
    const payload = new Uint8Array([1, 2, 3]);

    await expect(queue.send(payload, dc)).rejects.toThrow('DataChannel not open');
    expect(dc.send).not.toHaveBeenCalled();
  });

  it('sends only the visible bytes of a Uint8Array view', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(1000);
    const payload = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);

    await queue.send(payload, dc);

    const sent = (dc.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ArrayBuffer;
    expect(Array.from(new Uint8Array(sent))).toEqual([1, 2, 3]);
    expect(queue.getQueueLength()).toBe(0);
  });

  it('buffers and drains messages when bufferedAmount exceeds 64KB', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      fireBufferedAmountLow(dc);
    }, 10);

    await queue.send(payload, dc);

    expect(queue.getQueueLength()).toBe(0);
    expect(dc.send).toHaveBeenCalled();
  });

  it('reports queue length correctly during buffer/drain lifecycle', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    const sendPromise = queue.send(payload, dc);
    expect(queue.getQueueLength()).toBe(1);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      fireBufferedAmountLow(dc);
    }, 10);

    await sendPromise;
    expect(queue.getQueueLength()).toBe(0);
    expect(dc.send).toHaveBeenCalled();
  });

  it('reports draining state correctly', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    expect(queue.isDraining()).toBe(false);

    const sendPromise = queue.send(payload, dc);
    expect(queue.isDraining()).toBe(true);
    expect(queue.getQueueLength()).toBe(1);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      fireBufferedAmountLow(dc);
    }, 10);

    await sendPromise;
    expect(queue.isDraining()).toBe(false);
    expect(queue.getQueueLength()).toBe(0);
  });

  it('handles concurrent senders during drain', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload1 = new Uint8Array([1, 2, 3]);
    const payload2 = new Uint8Array([4, 5, 6]);

    const sendPromise1 = queue.send(payload1, dc);
    const sendPromise2 = queue.send(payload2, dc);

    expect(queue.getQueueLength()).toBe(2);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      fireBufferedAmountLow(dc);
    }, 10);

    await Promise.all([sendPromise1, sendPromise2]);
    expect(queue.getQueueLength()).toBe(0);
    expect(dc.send).toHaveBeenCalledTimes(2);
  });

  it('dc.send error in drain rejects the item promise and continues', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    dc.send = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Send failed');
      })
      .mockImplementationOnce(() => undefined);
    const payload1 = new Uint8Array([1, 2, 3]);
    const payload2 = new Uint8Array([4, 5, 6]);

    const sendPromise1 = queue.send(payload1, dc);
    const sendPromise2 = queue.send(payload2, dc);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      fireBufferedAmountLow(dc);
    }, 10);

    await expect(sendPromise1).rejects.toThrow('Send failed');
    await expect(sendPromise2).resolves.toBeUndefined();
    expect(dc.send).toHaveBeenCalledTimes(2);
  });

  it('clear rejects pending items and allows new sends', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    const sendPromise = queue.send(payload, dc);
    expect(queue.getQueueLength()).toBe(1);

    queue.clear();
    await expect(sendPromise).rejects.toThrow('Queue cleared');
    expect(queue.getQueueLength()).toBe(0);

    const dc2 = createMockDc(1000);
    await queue.send(new Uint8Array([7, 8, 9]), dc2);
    expect(dc2.send).toHaveBeenCalled();
  });

  it('rejects pending items when data channel closes during drain', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    const sendPromise = queue.send(payload, dc);

    const closeCb = (dc.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'close',
    );
    expect(closeCb).toBeDefined();
    (closeCb as NonNullable<typeof closeCb>)[1]();

    await expect(sendPromise).rejects.toThrow('DataChannel closed during drain');
    expect(queue.getQueueLength()).toBe(0);
  });

  it('constructor accepts custom thresholds and timeout', () => {
    const queue = new BackpressureQueue(128 * 1024, 64 * 1024, 500);
    expect(queue.getQueueLength()).toBe(0);
    expect(queue.isDraining()).toBe(false);
  });

  it('clear during drain resets draining state and allows new sends', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    const sendPromise = queue.send(payload, dc);
    expect(queue.isDraining()).toBe(true);
    expect(queue.getQueueLength()).toBe(1);

    queue.clear();

    expect(queue.isDraining()).toBe(false);
    expect(queue.getQueueLength()).toBe(0);
    await expect(sendPromise).rejects.toThrow('Queue cleared');

    // Draining is reset — new send past HWM must start a fresh drain
    const dc2 = createMockDc(100 * 1024);
    const payload2 = new Uint8Array([4, 5, 6]);
    const sendPromise2 = queue.send(payload2, dc2);
    expect(queue.isDraining()).toBe(true);

    setTimeout(() => {
      Object.defineProperty(dc2, 'bufferedAmount', { value: 0 });
      fireBufferedAmountLow(dc2);
    }, 10);

    await sendPromise2;
    expect(queue.getQueueLength()).toBe(0);
    expect(dc2.send).toHaveBeenCalled();
  });

  it('uses RttEstimator RTO for drain fallback timeout', async () => {
    const rttEstimator = new RttEstimator();
    for (let i = 0; i < 5; i++) {
      rttEstimator.updateRtt(300);
    }

    const queue = new BackpressureQueue(64 * 1024, 32 * 1024, 50, rttEstimator);
    const dc = createMockDc(100 * 1024);

    vi.useFakeTimers();

    const sendPromise = queue.send(new Uint8Array([1, 2, 3]), dc);
    expect(queue.isDraining()).toBe(true);
    expect(queue.getQueueLength()).toBe(1);

    // Lower bufferedAmount so the drain condition passes after the fallback fires
    Object.defineProperty(dc, 'bufferedAmount', { value: 0 });

    // Advance time past the RTT-derived drain timeout to trigger the fallback
    // getDrainTimeout() = Math.max(50, rto) which is >= 1000ms due to RTO floor
    const drainTimeout = rttEstimator.getRto();
    await vi.advanceTimersByTimeAsync(drainTimeout + 100);

    // The drain should have processed the queued item via the timeout fallback
    await sendPromise;
    expect(queue.getQueueLength()).toBe(0);
    expect(dc.send).toHaveBeenCalled();
    expect(queue.isDraining()).toBe(false);

    vi.useRealTimers();
  });
});
