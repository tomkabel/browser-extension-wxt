export type TransportType = 'usb' | 'webrtc';

export interface Transport {
  readonly type: TransportType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(payload: Uint8Array): Promise<void>;
  onMessage(callback: (data: Uint8Array) => void): void;
  onDisconnect(callback: () => void): void;
  getLatency(): Promise<number>;
  isAvailable(): boolean;
}

export type TransportEventType = 'message' | 'disconnect' | 'status-change';

export interface TransportStatus {
  type: TransportType;
  connected: boolean;
  latencyMs: number;
  deviceSerial?: string;
}

export interface NativeHostMessage {
  type: string;
  data?: string;
  success?: boolean;
  error?: string;
  payload?: unknown;
}

export interface NativeHostStatusResponse {
  connected: boolean;
  transport: string;
  latencyMs: number;
  deviceSerial?: string;
}
