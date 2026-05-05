/// <reference types="w3c-web-usb" />
import { log } from '~/lib/errors';
import { ANDROID_VENDOR_IDS } from '~/lib/transport/vendorIds';
import type { Transport, TransportType } from '~/lib/transport/types';
import {
  findEndpointPair,
  openUsbDevice,
  isAndroidDeviceAvailable,
  bufferToUint8Array,
  uint8ArrayToBufferSource,
  type UsbEndpointPair,
} from './webusbCore';

const READ_BUFFER_SIZE = 16_384;

export interface WebUsbAdapter {
  getDevices(): Promise<USBDevice[]>;
  isAndroidDeviceAvailable(): Promise<boolean>;
}

function defaultUsbAdapter(): WebUsbAdapter {
  return {
    getDevices: () => navigator.usb.getDevices(),
    isAndroidDeviceAvailable,
  };
}

export class WebUsbTransport implements Transport {
  readonly type: TransportType = 'usb';

  private device: USBDevice | null = null;
  private endpoints: UsbEndpointPair | null = null;
  private connected = false;
  private connectedAt = 0;
  private readLoopActive = false;
  private messageCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private readonly usb: WebUsbAdapter;

  constructor(usb?: WebUsbAdapter) {
    this.usb = usb ?? defaultUsbAdapter();
  }

  async connect(): Promise<void> {
    if (this.connected && this.device) return;

    const devices = await this.usb.getDevices();
    const android = devices.find((d) => ANDROID_VENDOR_IDS.has(d.vendorId));
    if (!android) {
      throw new Error('No AOA device found');
    }

    await openUsbDevice(android);

    const eps = findEndpointPair(android);
    if (!eps) {
      await android.close().catch(() => {});
      throw new Error('No valid USB endpoint pair found');
    }

    this.device = android;
    this.endpoints = eps;
    this.connected = true;
    this.connectedAt = performance.now();
    this.startReadLoop();
  }

  async disconnect(): Promise<void> {
    this.readLoopActive = false;
    try {
      if (this.device) {
        await this.device.close().catch(() => {});
      }
    } finally {
      this.device = null;
      this.endpoints = null;
      this.connected = false;
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.device || !this.connected || !this.endpoints) {
      throw new Error('WebUSB not connected');
    }
    await this.device.transferOut(
      this.endpoints.out.endpointNumber,
      uint8ArrayToBufferSource(data),
    );
  }

  onMessage(callback: (data: Uint8Array) => void): void {
    this.messageCallbacks.push(callback);
  }

  removeMessageListener(callback: (data: Uint8Array) => void): void {
    const idx = this.messageCallbacks.indexOf(callback);
    if (idx >= 0) this.messageCallbacks.splice(idx, 1);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  removeDisconnectListener(callback: () => void): void {
    const idx = this.disconnectCallbacks.indexOf(callback);
    if (idx >= 0) this.disconnectCallbacks.splice(idx, 1);
  }

  async getLatency(): Promise<number> {
    if (!this.connected) return -1;
    // Direct USB transfer latency is not measurable without pausing the
    // read loop (both compete for the same IN endpoint). Return a nominal
    // value so TransportManager considers this transport healthy; actual
    // quality monitoring uses the message-layer ping in the extension.
    return 1;
  }

  isAvailable(): boolean {
    return this.connected && this.device !== null;
  }

  async checkAvailability(): Promise<boolean> {
    if (this.device) return true;
    return this.usb.isAndroidDeviceAvailable();
  }

  private startReadLoop(): void {
    if (this.readLoopActive || !this.device || !this.endpoints) return;
    this.readLoopActive = true;
    this.readLoop();
  }

  private async readLoop(): Promise<void> {
    while (this.readLoopActive && this.device?.opened && this.endpoints) {
      try {
        const result = await this.device.transferIn(
          this.endpoints.in.endpointNumber,
          READ_BUFFER_SIZE,
        );
        if (result.data && result.data.byteLength > 0) {
          const bytes = bufferToUint8Array(result.data.buffer);
          for (const cb of this.messageCallbacks) {
            try {
              cb(bytes);
            } catch {
              // listener error — don't let one bad callback kill the loop
            }
          }
        }
      } catch (err) {
        if (this.readLoopActive) {
          log.error('[WebUsbTransport] Read error:', err);
          this.handleDisconnect();
        }
        break;
      }
    }
  }

  private handleDisconnect(): void {
    this.readLoopActive = false;
    this.connected = false;
    this.device = null;
    this.endpoints = null;
    for (const cb of [...this.disconnectCallbacks]) {
      try {
        cb();
      } catch {
        // listener error
      }
    }
  }
}
