import type { RttEstimator } from '~/lib/channel/rttEstimator';
import { ExtensionError } from '~/lib/errors';

interface QueuedItem {
  payload: Uint8Array;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class BackpressureQueue {
  private queue: QueuedItem[] = [];
  private pendingBytes = 0;
  private readonly HIGH_WATER_MARK: number;
  private readonly DRAIN_THRESHOLD: number;
  private readonly DRAIN_TIMEOUT: number;
  private readonly rttEstimator?: RttEstimator;
  private draining = false;
  private drainGeneration = 0;

  constructor(highWaterMark = 64 * 1024, drainThreshold = 32 * 1024, drainTimeout = 100, rttEstimator?: RttEstimator) {
    this.HIGH_WATER_MARK = highWaterMark;
    this.DRAIN_THRESHOLD = drainThreshold;
    this.DRAIN_TIMEOUT = drainTimeout;
    this.rttEstimator = rttEstimator;
  }

  async send(payload: Uint8Array, dc: RTCDataChannel): Promise<void> {
    if (dc.readyState !== 'open') {
      throw new ExtensionError('DataChannel not open', 'DC_NOT_OPEN', false);
    }

    const totalPending = dc.bufferedAmount + this.pendingBytes + payload.byteLength;

    if (this.queue.length > 0 || totalPending > this.HIGH_WATER_MARK) {
      return new Promise<void>((resolve, reject) => {
        this.queue.push({ payload, resolve, reject });
        this.pendingBytes += payload.byteLength;
        if (!this.draining) {
          this.draining = true;
          this.drain(dc).catch(() => {
            this.draining = false;
          });
        }
      });
    }

    dc.send(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer);
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDraining(): boolean {
    return this.draining;
  }

  clear(): void {
    const items = this.queue.splice(0);
    this.pendingBytes = 0;
    this.drainGeneration++;
    this.draining = false;
    for (const item of items) {
      item.reject(new ExtensionError('Queue cleared', 'QUEUE_CLEARED', false));
    }
  }

  private async drain(dc: RTCDataChannel): Promise<void> {
    const gen = ++this.drainGeneration;
    dc.bufferedAmountLowThreshold = this.DRAIN_THRESHOLD;

    const onClose = () => {
      const items = this.queue.splice(0);
      this.pendingBytes = 0;
      for (const item of items) {
        item.reject(new ExtensionError('DataChannel closed during drain', 'DC_CLOSED', false));
      }
    };
    dc.addEventListener('close', onClose);

    try {
      while (this.queue.length > 0) {
        if (gen !== this.drainGeneration) break;

        if (dc.bufferedAmount <= this.DRAIN_THRESHOLD) {
          const item = this.queue.shift()!;
          this.pendingBytes -= item.payload.byteLength;
          try {
            dc.send(item.payload.buffer.slice(item.payload.byteOffset, item.payload.byteOffset + item.payload.byteLength) as ArrayBuffer);
            item.resolve();
          } catch (err) {
            item.reject(new ExtensionError(err instanceof Error ? err.message : String(err), 'SEND_FAILED', false));
          }
          continue;
        }

        await this.waitForDrainEvent(dc);
      }
    } finally {
      dc.removeEventListener('close', onClose);
      if (gen === this.drainGeneration) {
        this.draining = false;
      }
    }
  }

  private getDrainTimeout(): number {
    if (this.rttEstimator) {
      return Math.max(this.DRAIN_TIMEOUT, this.rttEstimator.getRto());
    }
    return this.DRAIN_TIMEOUT;
  }

  private waitForDrainEvent(dc: RTCDataChannel): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      let fallback: ReturnType<typeof setTimeout>;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        dc.removeEventListener('bufferedamountlow', finish);
        resolve();
      };

      dc.addEventListener('bufferedamountlow', finish);
      fallback = setTimeout(finish, this.getDrainTimeout());
    });
  }
}
