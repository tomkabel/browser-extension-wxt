import { browser } from 'wxt/browser';
import { NATIVE_HOST_NAME, TRANSPORT_CONFIG } from './config';
import type {
  NativeHostMessage,
  NativeHostStatusResponse,
  Transport,
  TransportType,
} from './types';

export class UsbTransport implements Transport {
  readonly type: TransportType = 'usb';

  private connected = false;
  private disconnecting = false;
  private messageCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private port: chrome.runtime.Port | null = null;

  async connect(): Promise<void> {
    try {
      const response = await this.sendNativeMessage({
        type: 'connect',
      });

      if (response.success) {
        this.connected = true;
        this.disconnecting = false;
        this.startListening();
      } else {
        throw new Error(response.error ?? 'USB connect failed');
      }
    } catch (err) {
      this.connected = false;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connected) {
        await this.sendNativeMessage({ type: 'disconnect' });
      }
    } finally {
      this.cleanup();
    }
  }

  async send(payload: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('USB transport not connected');
    }

    const base64 = this.arrayBufferToBase64(payload);
    const response = await this.sendNativeMessage({
      type: 'send-payload',
      data: base64,
    });

    if (!response.success) {
      throw new Error(response.error ?? 'USB send failed');
    }
  }

  onMessage(callback: (data: Uint8Array) => void): void {
    this.messageCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  async getLatency(): Promise<number> {
    const start = performance.now();
    try {
      await this.sendNativeMessage({ type: 'ping' });
      return performance.now() - start;
    } catch {
      return -1;
    }
  }

  isAvailable(): boolean {
    return this.connected;
  }

  private startListening(): void {
    this.port = browser.runtime.connectNative(NATIVE_HOST_NAME);

    this.port.onMessage.addListener((msg: NativeHostMessage) => {
      if (msg.type === 'payload-received' && msg.data) {
        const bytes = this.base64ToArrayBuffer(msg.data);
        for (const cb of this.messageCallbacks) {
          cb(bytes);
        }
      } else if (msg.type === 'usb-disconnected') {
        this.handleDisconnect();
      }
    });

    this.port.onDisconnect.addListener(() => {
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    if (this.disconnecting) {
      return;
    }
    this.disconnecting = true;
    this.connected = false;
    this.cleanup();
    for (const cb of this.disconnectCallbacks) {
      cb();
    }
  }

  private cleanup(): void {
    this.connected = false;
    if (this.port) {
      const port = this.port;
      this.port = null;
      try {
        port.disconnect();
      } catch {
        // port may already be disconnected
      }
    }
  }

  private sendNativeMessage(message: NativeHostMessage): Promise<NativeHostMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Native message timeout'));
      }, TRANSPORT_CONFIG.sendTimeoutMs);

      try {
        chrome.runtime.sendNativeMessage(
          NATIVE_HOST_NAME,
          message,
          (response: NativeHostMessage | undefined) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response) {
              reject(new Error('Empty native host response'));
            } else {
              resolve(response);
            }
          }
        );
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await this.sendNativeMessage({ type: 'ping' });
      return response.type === 'pong';
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<NativeHostStatusResponse> {
    const response = await this.sendNativeMessage({ type: 'get-status' });
    return response.payload as NativeHostStatusResponse;
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
