export class BackpressureQueue {
  private queue: Uint8Array[] = [];
  private readonly HIGH_WATER_MARK = 64 * 1024;
  private readonly DRAIN_THRESHOLD = 32 * 1024;
  private readonly POLL_INTERVAL_MS = 50;
  private draining = false;

  async send(payload: Uint8Array, dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount > this.HIGH_WATER_MARK) {
      this.queue.push(payload);
      if (!this.draining) {
        await this.drain(dc);
      }
    } else {
      (dc.send as (data: Uint8Array<ArrayBuffer>) => void)(payload as Uint8Array<ArrayBuffer>);
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDraining(): boolean {
    return this.draining;
  }

  clear(): void {
    this.queue = [];
    this.draining = false;
  }

  private async drain(dc: RTCDataChannel): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      if (dc.bufferedAmount < this.DRAIN_THRESHOLD) {
        const payload = this.queue.shift();
        if (payload) {
          (dc.send as (data: Uint8Array<ArrayBuffer>) => void)(payload as Uint8Array<ArrayBuffer>);
        }
      }
      await new Promise(r => setTimeout(r, this.POLL_INTERVAL_MS));
    }
    this.draining = false;
  }
}
