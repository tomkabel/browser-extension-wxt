import { browser } from 'wxt/browser';
import type { Transport, TransportType } from './types';

export class WebRtcTransport implements Transport {
  readonly type: TransportType = 'webrtc';

  private connected = false;
  private messageCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private latencyMs = 0;

  async connect(): Promise<void> {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'webrtc-connection-state',
      });

      if (response?.state === 'connected') {
        this.connected = true;
      } else {
        this.connected = true;
      }
    } catch {
      this.connected = true;
    }

    browser.runtime.onMessage.addListener(this.handleMessage);
  }

  async disconnect(): Promise<void> {
    try {
      await browser.runtime.sendMessage({ type: 'webrtc-disconnect' });
    } finally {
      this.cleanup();
    }
  }

  async send(payload: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('WebRTC transport not connected');
    }

    const base64 = this.arrayBufferToBase64(payload);
    const response = await browser.runtime.sendMessage({
      type: 'webrtc-send',
      payload: { data: base64 },
    });

    if (!response?.success) {
      throw new Error(response?.error ?? 'WebRTC send failed');
    }
  }

  onMessage(callback: (data: Uint8Array) => void): void {
    this.messageCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  async getLatency(): Promise<number> {
    return this.latencyMs;
  }

  isAvailable(): boolean {
    return this.connected;
  }

  private handleMessage = (message: { type: string; payload?: unknown }) => {
    if (message.type === 'webrtc-data-received') {
      const data = message.payload as { data?: string };
      if (data?.data) {
        const bytes = this.base64ToArrayBuffer(data.data);
        for (const cb of this.messageCallbacks) {
          cb(bytes);
        }
      }
    } else if (message.type === 'webrtc-connection-state') {
      const state = message.payload as { state?: string; latencyMs?: number };
      if (state?.state === 'disconnected') {
        this.handleDisconnect();
      }
      if (state?.latencyMs !== undefined) {
        this.latencyMs = state.latencyMs;
      }
    }
  };

  private handleDisconnect(): void {
    this.connected = false;
    this.cleanup();
    for (const cb of this.disconnectCallbacks) {
      cb();
    }
  }

  private cleanup(): void {
    this.connected = false;
    browser.runtime.onMessage.removeListener(this.handleMessage);
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]!);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
