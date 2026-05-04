import { describe, it, expect, vi } from 'vitest';
import { BackpressureQueue } from './backpressureQueue';

function createMockDc(bufferedAmount = 0): RTCDataChannel {
  const listeners = new Map<string, Array<() => void>>();
  return {
    bufferedAmount,
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
  } as unknown as RTCDataChannel;
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

  it('buffers messages when bufferedAmount exceeds 64KB', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      const bufferedAmountLowCb = (dc.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === 'bufferedamountlow',
      );
      if (bufferedAmountLowCb) bufferedAmountLowCb[1]();
    }, 10);

    await queue.send(payload, dc);

    expect(queue.getQueueLength()).toBe(0);
    expect(dc.send).toHaveBeenCalled();
  });

  it('drains queue when bufferedAmount drops below threshold', async () => {
    const queue = new BackpressureQueue();
    const dc = createMockDc(100 * 1024);
    const payload = new Uint8Array([1, 2, 3]);

    const sendPromise = queue.send(payload, dc);
    expect(queue.getQueueLength()).toBe(1);

    setTimeout(() => {
      Object.defineProperty(dc, 'bufferedAmount', { value: 0 });
      const bufferedAmountLowCb = (dc.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === 'bufferedamountlow',
      );
      if (bufferedAmountLowCb) bufferedAmountLowCb[1]();
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
      const bufferedAmountLowCb = (dc.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === 'bufferedamountlow',
      );
      if (bufferedAmountLowCb) bufferedAmountLowCb[1]();
    }, 10);

    await sendPromise;
    expect(queue.isDraining()).toBe(false);
    expect(queue.getQueueLength()).toBe(0);
  });
});
