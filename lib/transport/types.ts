export type TransportType = 'usb' | 'webrtc';

/**
 * @future Defined for V6 migration strategy (design.md §4).
 * Not consumed by TransportManager yet — will be used when
 * user-configurable transport preferences are implemented.
 */
export interface TransportConfig {
  preferredTransport: 'usb' | 'webrtc' | 'auto';
  usbTimeoutMs: number;
  webrtcTimeoutMs: number;
}

/**
 * Low-level transport abstraction. Sends/receives raw bytes (Uint8Array).
 * Serialized ExtensionMessage payloads (from ~/types) are carried over this channel.
 * Compatible with all MessageType shapes defined in types/index.ts.
 */
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

/**
 * @future Defined for V6 migration strategy. Higher-level send/receive
 * abstraction over Transport. Will be used by offscreen document
 * relay pattern when USB AOA data channel is implemented.
 */
export interface MessageChannel {
  send(data: Uint8Array): Promise<void>;
  onReceive(callback: (data: Uint8Array) => void): void;
  close(): void;
  readonly isOpen: boolean;
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
  transport: TransportType;
  latencyMs: number;
  deviceSerial?: string;
}
