import { browser } from 'wxt/browser';
import { NATIVE_HOST_NAME, TRANSPORT_CONFIG } from './config';
import type {
  NativeHostMessage,
  NativeHostStatusResponse,
  Transport,
  TransportType,
} from './types';

interface PendingRequest {
  resolve: (value: NativeHostMessage) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class UsbTransport implements Transport {
  readonly type: TransportType = 'usb';

  private connected = false;
  private disconnecting = false;
  private messageCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private port: chrome.runtime.Port | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;

  async connect(): Promise<void> {
    try {
      this.port = browser.runtime.connectNative(NATIVE_HOST_NAME);
      this.startListening();

      const response = await this.sendViaPort({
        type: 'connect',
      });

      if (response.success) {
        this.connected = true;
        this.disconnecting = false;
      } else {
        throw new Error(response.error ?? 'USB connect failed');
      }
    } catch (err) {
      this.cleanup();
      this.connected = false;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connected) {
        await this.sendViaPort({ type: 'disconnect' });
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
    const response = await this.sendViaPort({
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
      await this.sendViaPort({ type: 'ping' });
      return performance.now() - start;
    } catch {
      return -1;
    }
  }

  isAvailable(): boolean {
    return this.connected;
  }

  private startListening(): void {
    if (!this.port) {
      return;
    }

    this.port.onMessage.addListener(
      (msg: NativeHostMessage & { id?: string }) => {
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg);
          return;
        }

        if (msg.type === 'payload-received' && msg.data) {
          const bytes = this.base64ToArrayBuffer(msg.data);
          for (const cb of this.messageCallbacks) {
            cb(bytes);
          }
        }
      },
    );

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
    for (const { timer, reject } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new Error('Transport disconnected'));
    }
    this.pendingRequests.clear();
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

  private sendViaPort(message: NativeHostMessage): Promise<NativeHostMessage> {
    const id = `req_${++this.requestCounter}`;

    if (!this.port) {
      return Promise.reject(new Error('No active port'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Port message timeout'));
      }, TRANSPORT_CONFIG.sendTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.port!.postMessage({ id, ...message });
    });
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await this.sendViaPort({ type: 'ping' });
      return response.type === 'pong';
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<NativeHostStatusResponse> {
    const response = await this.sendViaPort({ type: 'get-status' });
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
