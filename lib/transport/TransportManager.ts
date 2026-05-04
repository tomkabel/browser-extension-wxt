import { browser } from 'wxt/browser';
import { TRANSPORT_CONFIG } from './config';
import type { Transport, TransportType } from './types';
import { UsbTransport } from './UsbTransport';
import { WebRtcTransport } from './WebRtcTransport';

export type TransportManagerEventType = 'transport-changed' | 'status-change';

export interface TransportChangeEvent {
  previous: TransportType | null;
  current: TransportType;
  reason: string;
}

export class TransportManager {
  private usbTransport: UsbTransport;
  private webrtcTransport: WebRtcTransport;
  private activeTransport: Transport | null = null;
  private usbAvailable = false;
  private connecting = false;
  private usbPollTimer: ReturnType<typeof setInterval> | null = null;
  private hostCheckTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Array<(data: unknown) => void>> = new Map();
  private messageCallback: ((data: Uint8Array) => void) | null = null;

  constructor() {
    this.usbTransport = new UsbTransport();
    this.webrtcTransport = new WebRtcTransport();

    this.usbTransport.onDisconnect(() => {
      if (this.activeTransport?.type === 'usb') {
        this.switchTransport('webrtc', 'USB disconnected').catch(() => {});
      }
    });

    this.webrtcTransport.onDisconnect(() => {
      if (this.activeTransport?.type === 'webrtc') {
        this.emit('status-change', { connected: false });
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    try {
      this.usbAvailable = await this.checkUsbAvailability();

      if (this.usbAvailable) {
        try {
          await this.usbTransport.connect();
          this.activeTransport = this.usbTransport;
          this.emitChange(null, 'usb', 'USB available on init');
        } catch {
          await this.connectWebRtc();
        }
      } else {
        await this.connectWebRtc();
      }

      this.startUsbPolling();
    } finally {
      this.connecting = false;
    }
  }

  async send(payload: Uint8Array): Promise<void> {
    if (!this.activeTransport) {
      throw new Error('No active transport');
    }
    await this.activeTransport.send(payload);
  }

  onMessage(callback: (data: Uint8Array) => void): void {
    this.messageCallback = callback;
    if (this.activeTransport) {
      this.activeTransport.onMessage(callback);
    }
  }

  on(event: TransportManagerEventType, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  getActiveTransport(): Transport | null {
    return this.activeTransport;
  }

  getActiveTransportType(): TransportType | null {
    return this.activeTransport?.type ?? null;
  }

  isUsbAvailable(): boolean {
    return this.usbAvailable;
  }

  async destroy(): Promise<void> {
    if (this.usbPollTimer) {
      clearInterval(this.usbPollTimer);
      this.usbPollTimer = null;
    }

    if (this.activeTransport) {
      await this.activeTransport.disconnect();
    }
  }

  async switchTransport(
    target: TransportType,
    reason: string,
  ): Promise<void> {
    const previous = this.activeTransport?.type ?? null;
    const current = this.activeTransport;

    if (target === 'usb' && this.usbAvailable) {
      try {
        await this.usbTransport.connect();
        if (current && current.type !== 'usb') {
          await current.disconnect();
        }
        this.activeTransport = this.usbTransport;
        if (this.messageCallback) {
          this.usbTransport.onMessage(this.messageCallback);
        }
        this.emitChange(previous, 'usb', reason);
        return;
      } catch {
        // USB connect failed, stay on current
      }
    }

    if (target === 'webrtc') {
      if (current && current.type !== 'webrtc') {
        await current.disconnect();
      }
      await this.connectWebRtc();
      if (this.activeTransport?.type === 'webrtc') {
        this.emitChange(previous, 'webrtc', reason);
      } else {
        this.emit('status-change', { connected: false, reason });
      }
    }
  }

  private async connectWebRtc(): Promise<void> {
    try {
      await this.webrtcTransport.connect();
      this.activeTransport = this.webrtcTransport;
      if (this.messageCallback) {
        this.webrtcTransport.onMessage(this.messageCallback);
      }
    } catch {
      this.activeTransport = null;
    }
  }

  private async checkUsbAvailability(): Promise<boolean> {
    try {
      return await this.usbTransport.checkAvailability();
    } catch {
      return false;
    }
  }

  private startUsbPolling(): void {
    this.usbPollTimer = setInterval(async () => {
      const wasAvailable = this.usbAvailable;
      this.usbAvailable = await this.checkUsbAvailability();

      if (this.usbAvailable && !wasAvailable) {
        if (this.activeTransport?.type !== 'usb') {
          await this.switchTransport('usb', 'USB became available');
        }
      } else if (!this.usbAvailable && wasAvailable) {
        if (this.activeTransport?.type === 'usb') {
          await this.switchTransport('webrtc', 'USB became unavailable');
        }
      }
    }, TRANSPORT_CONFIG.usbPollIntervalMs);
  }

  private emitChange(
    previous: TransportType | null,
    current: TransportType,
    reason: string,
  ): void {
    this.emit('transport-changed', { previous, current, reason } as TransportChangeEvent);

    try {
      browser.runtime.sendMessage({
        type: 'transport-changed',
        payload: { previous, current, reason },
      });
    } catch {
      // no listeners
    }
  }

  private emit(event: string, data: unknown): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(data);
        } catch {
          // listener error
        }
      }
    }
  }
}
