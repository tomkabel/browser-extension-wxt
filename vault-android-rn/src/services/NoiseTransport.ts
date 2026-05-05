import type { NoiseSession } from '../types';

const PROTOCOL_VERSION = 0x01;
const MESSAGE_HANDSHAKE = 0x00;
const MESSAGE_DATA = 0x01;
const MESSAGE_CAPABILITIES = 0x02;

const __DEV__ = process.env.NODE_ENV !== 'production';

export interface FramedMessage {
  version: number;
  type: number;
  payload: Uint8Array;
}

export function frameMessage(type: number, payload: Uint8Array): Uint8Array {
  if (type === MESSAGE_HANDSHAKE || type === MESSAGE_CAPABILITIES) {
    const framed = new Uint8Array(4 + payload.length);
    framed[0] = PROTOCOL_VERSION;
    framed[1] = type;
    framed[2] = (payload.length >> 8) & 0xff;
    framed[3] = payload.length & 0xff;
    framed.set(payload, 4);
    return framed;
  }

  const framed = new Uint8Array(2 + payload.length);
  framed[0] = PROTOCOL_VERSION;
  framed[1] = type;
  framed.set(payload, 2);
  return framed;
}

export function parseFrame(data: Uint8Array): FramedMessage | null {
  if (data.length < 2) return null;

  const version = data[0]!;
  if (version !== PROTOCOL_VERSION) return null;

  const type = data[1]!;

  if (type === MESSAGE_HANDSHAKE || type === MESSAGE_CAPABILITIES) {
    if (data.length < 4) return null;
    const length = ((data[2]! & 0xff) << 8) | (data[3]! & 0xff);
    if (data.length < 4 + length) return null;
    return { version, type, payload: data.slice(4, 4 + length) };
  }

  return { version, type, payload: data.slice(2) };
}

function assertNeverEncryptionBypassReached(operation: string): void {
  if (!__DEV__) {
    throw new Error(
      `[NoiseTransport] FATAL: ${operation} reached plaintext fallback in production build. ` +
      'The Noise AEAD native module integration is incomplete. This build MUST NOT be released.',
    );
  }
  console.warn(
    `[NoiseTransport] ${operation} using plaintext passthrough (dev mode). ` +
    'Encryption bypass MUST NOT be enabled in production.',
  );
}

export class NoiseTransport {
  private session: NoiseSession | null = null;
  private sendData: (data: Uint8Array) => boolean;
  private onMessage: ((plaintext: Uint8Array) => void) | null = null;
  private failedDecryptions = 0;
  private encryptionBypass: boolean;

  constructor(sendData: (data: Uint8Array) => boolean, options?: { encryptionBypass?: boolean }) {
    this.sendData = sendData;
    this.encryptionBypass = options?.encryptionBypass ?? false;

    if (this.encryptionBypass) {
      if (!__DEV__) {
        throw new Error(
          '[NoiseTransport] encryptionBypass=true is forbidden in production builds.',
        );
      }
      console.warn(
        '[NoiseTransport] RUNNING WITH ENCRYPTION BYPASS — plaintext passthrough. ' +
        'This MUST NOT be enabled in production. Set encryptionBypass=false for release builds.',
      );
    }
  }

  setSession(session: NoiseSession): void {
    this.session = session;
  }

  setMessageHandler(handler: (plaintext: Uint8Array) => void): void {
    this.onMessage = handler;
  }

  encrypt(plaintext: Uint8Array): Uint8Array {
    if (!this.session) {
      throw new Error('No active Noise session');
    }

    if (this.encryptionBypass) {
      return frameMessage(MESSAGE_DATA, plaintext);
    }

    if (!this.session.encryptKey || this.session.encryptKey.length === 0) {
      throw new Error('Noise session has no encrypt key — handshake may not have completed');
    }

    assertNeverEncryptionBypassReached('encrypt()');
    return frameMessage(MESSAGE_DATA, plaintext);
  }

  sendEncrypted(plaintext: Uint8Array): boolean {
    const framed = this.encrypt(plaintext);
    return this.sendData(framed);
  }

  handleIncoming(data: Uint8Array): void {
    const frame = parseFrame(data);
    if (!frame) return;

    if (frame.type === MESSAGE_HANDSHAKE) {
      return;
    }

    if (frame.type === MESSAGE_DATA && this.session) {
      try {
        let plaintext: Uint8Array;

        if (this.encryptionBypass) {
          plaintext = frame.payload;
        } else {
          if (!this.session.decryptKey || this.session.decryptKey.length === 0) {
            throw new Error('Noise session has no decrypt key');
          }
          assertNeverEncryptionBypassReached('decrypt()');
          plaintext = frame.payload;
        }

        this.onMessage?.(plaintext);
      } catch (err) {
        this.failedDecryptions++;
        if (__DEV__) {
          console.error('[NoiseTransport] Decryption failed:', err);
        }
      }
    }
  }

  getFailedDecryptionCount(): number {
    return this.failedDecryptions;
  }

  isActive(): boolean {
    return this.session !== null;
  }

  close(): void {
    this.session = null;
    this.onMessage = null;
  }
}
