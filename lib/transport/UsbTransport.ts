import { browser } from 'wxt/browser';
import { TRANSPORT_CONFIG } from './config';
import type { Transport, TransportType } from './types';

export class UsbTransport implements Transport {
  readonly type: TransportType = 'usb';

  private connected = false;
  private disconnecting = false;
  private messageCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private offscreenReady = false;
  private usbSupported = false;

  async connect(): Promise<void> {
    try {
      this.usbSupported = typeof navigator !== 'undefined' && 'usb' in navigator;

      if (this.usbSupported) {
        const response = await browser.runtime.sendMessage({
          type: 'webrtc-connect-usb',
          payload: {},
        });
        const data = response as { success?: boolean; error?: string } | undefined;
        if (data?.success) {
          this.connected = true;
          this.disconnecting = false;
          this.offscreenReady = true;
          return;
        }
        throw new Error(data?.error ?? 'WebUSB connection failed');
      }

      const response = await browser.runtime.sendMessage({
        type: 'webrtc-connect-usb',
        payload: {},
      });
      const fallbackData = response as { success?: boolean } | undefined;
      if (fallbackData?.success) {
        this.connected = true;
        return;
      }
      throw new Error('No USB transport available');
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await browser.runtime.sendMessage({
        type: 'webrtc-disconnect',
        payload: {},
      });
    } finally {
      this.cleanup();
    }
  }

  async send(payload: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('USB transport not connected');
    }

    await browser.runtime.sendMessage({
      type: 'webrtc-send',
      payload: { data: Array.from(payload) },
    });
  }

  onMessage(callback: (data: Uint8Array) => void): void {
    this.messageCallbacks.push(callback);

    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; payload?: { data?: number[] } } | undefined;
      if (msg?.type === 'webrtc-data-received' && msg.payload?.data) {
        callback(new Uint8Array(msg.payload.data));
      }
    });
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  async getLatency(): Promise<number> {
    const start = performance.now();
    try {
      await browser.runtime.sendMessage({ type: 'webrtc-ping', payload: {} });
      return performance.now() - start;
    } catch {
      return -1;
    }
  }

  isAvailable(): boolean {
    return this.connected;
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await browser.runtime.sendMessage({ type: 'webrtc-ping', payload: {} });
      return true;
    } catch {
      return false;
    }
  }

  private cleanup(): void {
    this.connected = false;
    this.disconnecting = false;
    this.offscreenReady = false;
  }
}
