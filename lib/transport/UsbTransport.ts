import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';
import { ANDROID_VENDOR_IDS } from './vendorIds';
import type { Transport, TransportType } from './types';

export class UsbTransport implements Transport {
  readonly type: TransportType = 'usb';

  private connected = false;
  private messageCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private device: USBDevice | null = null;
  private readLoopActive = false;
  private listenerAttached = false;

  async connect(): Promise<void> {
    if (this.device) {
      this.connected = true;
      return;
    }

    try {
      const device = await this.requestDevice();
      if (device) {
        await device.open();
        if (device.configuration === null) {
          await device.selectConfiguration(1);
        }
        await device.claimInterface(0);
        this.device = device;
        this.connected = true;
        this.startReadLoop(device);
        log.info('[UsbTransport] Connected via WebUSB');
        return;
      }
    } catch (err) {
      log.warn('[UsbTransport] WebUSB unavailable, falling back to offscreen relay:', err);
    }

    const response = await browser.runtime.sendMessage({
      type: 'webrtc-connect-usb',
      payload: {},
    });
    const data = response as { success?: boolean; error?: string } | undefined;
    if (data?.success) {
      this.connected = true;
      log.info('[UsbTransport] Connected via offscreen relay');
      return;
    }
    throw new Error(data?.error ?? 'No USB transport available');
  }

  async disconnect(): Promise<void> {
    this.readLoopActive = false;
    try {
      if (this.device) {
        try {
          await this.device.close();
        } catch {
          // device may already be detached
        }
        this.device = null;
        return;
      }
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

    if (this.device) {
      const endpoint = this.findOutputEndpoint();
      if (endpoint) {
        await this.device.transferOut(endpoint.endpointNumber, payload as unknown as BufferSource);
        return;
      }
    }

    await browser.runtime.sendMessage({
      type: 'webrtc-send',
      payload: { data: Array.from(payload) },
    });
  }

  onMessage(callback: (data: Uint8Array) => void): void {
    this.messageCallbacks.push(callback);
    if (this.listenerAttached) return;
    this.listenerAttached = true;
    browser.runtime.onMessage.addListener((message) => {
      if (!this.connected) return;
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
    if (this.device) return true;
    try {
      const devices = await navigator.usb.getDevices();
      for (const d of devices) {
        if (ANDROID_VENDOR_IDS.has(d.vendorId)) return true;
      }
    } catch {
      // WebUSB not supported
    }
    return false;
  }

  private async requestDevice(): Promise<USBDevice | null> {
    try {
      const devices = await navigator.usb.getDevices();
      for (const d of devices) {
        if (ANDROID_VENDOR_IDS.has(d.vendorId)) return d;
      }
    } catch {
      return null;
    }
    return null;
  }

  private findOutputEndpoint(): USBEndpoint | undefined {
    if (!this.device) return undefined;
    for (const iface of this.device.configuration?.interfaces ?? []) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === 'out') return ep;
        }
      }
    }
    return undefined;
  }

  private async startReadLoop(device: USBDevice): Promise<void> {
    if (this.readLoopActive) return;
    this.readLoopActive = true;

    const endpoint = this.findInputEndpoint();
    if (!endpoint) {
      this.readLoopActive = false;
      return;
    }

    while (this.readLoopActive && this.device) {
      try {
        const result = await device.transferIn(endpoint.endpointNumber, endpoint.packetSize);
        if (result.data?.buffer) {
          const data = new Uint8Array(result.data.buffer);
          for (const cb of this.messageCallbacks) {
            try {
              cb(data);
            } catch {
              // listener error
            }
          }
        }
      } catch (err) {
        if (this.readLoopActive) {
          log.error('[UsbTransport] Read error:', err);
          this.cleanup();
          for (const cb of this.disconnectCallbacks) {
            try {
              cb();
            } catch {
              // listener error
            }
          }
        }
        break;
      }
    }
  }

  private findInputEndpoint(): USBEndpoint | undefined {
    if (!this.device) return undefined;
    for (const iface of this.device.configuration?.interfaces ?? []) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === 'in') return ep;
        }
      }
    }
    return undefined;
  }

  private cleanup(): void {
    this.connected = false;
    this.device = null;
    this.readLoopActive = false;
    this.listenerAttached = false;
  }
}
