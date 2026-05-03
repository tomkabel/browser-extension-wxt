import type { TransportState } from 'salty-crypto';

export interface NoiseKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface NoiseSession {
  handshakePattern: 'XX' | 'IK';
  transport: TransportState;
  localStaticKey: NoiseKeyPair;
  remoteStaticPublicKey?: Uint8Array;
}

export interface CachedPairing {
  localStaticKey: number[];
  remoteStaticPublicKey: number[];
  handshakePattern: 'XX' | 'IK';
  pairedAt: number;
}

export interface NoiseXXResult {
  session: NoiseSession;
  messageCount: number;
}

export interface NoiseIKResult {
  session: NoiseSession;
  messageCount: number;
}
