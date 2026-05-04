export class BackpressureQueue {
  private queue: Uint8Array[] = [];
  private readonly HIGH_WATER_MARK = 64 * 1024;
  private readonly DRAIN_THRESHOLD = 32 * 1024;
  private draining = false;
  private drainResolve: (() => void) | null = null;

  async send(payload: Uint8Array, dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount > this.HIGH_WATER_MARK) {
      this.queue.push(payload);
      if (!this.draining) {
        await this.drain(dc);
      }
    } else {
            dc.send(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer);
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDraining(): boolean {
    return this.draining;
  }

  clear(): void {
    this.queue.length = 0;
    this.draining = false;
    if (this.drainResolve) {
      this.drainResolve();
      this.drainResolve = null;
    }
  }

  private async drain(dc: RTCDataChannel): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        if (dc.bufferedAmount < this.DRAIN_THRESHOLD) {
          const payload = this.queue.shift();
          if (payload) {
      dc.send(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer);
          }
          continue;
        }
        await new Promise<void>((resolve) => {
          const onBufferedAmountLow = () => {
            dc.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            resolve();
          };
          dc.addEventListener('bufferedamountlow', onBufferedAmountLow);
          const fallback = setTimeout(resolve, 100);
          this.drainResolve = () => {
            clearTimeout(fallback);
            dc.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            resolve();
          };
        });
        this.drainResolve = null;
      }
    } finally {
      this.draining = false;
    }
  }
}
