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
  remoteCapabilities?: ProtocolCapabilities;
}

export interface CachedPairing {
  localStaticKey: number[];
  remoteStaticPublicKey: number[];
  handshakePattern: 'XX' | 'IK';
  pairedAt: number;
  remoteCapabilities?: ProtocolCapabilities;
}

export interface NoiseXXResult {
  session: NoiseSession;
  messageCount: number;
}

export interface NoiseIKResult {
  session: NoiseSession;
  messageCount: number;
}

export interface ProtocolCapabilities {
  version: number;
  features: string[];
  supportedTransports: string[];
}

export const CURRENT_PROTOCOL_VERSION = 2;
export const SUPPORTED_FEATURES = [
  'prf',
  'challenge-bound-v1',
  'credential-provision',
  'session-resume-ik',
];
export const SUPPORTED_TRANSPORTS = ['webrtc', 'usb'];

export function encodeCapabilities(): Uint8Array {
  const caps: ProtocolCapabilities = {
    version: CURRENT_PROTOCOL_VERSION,
    features: SUPPORTED_FEATURES,
    supportedTransports: SUPPORTED_TRANSPORTS,
  };
  return new TextEncoder().encode(JSON.stringify(caps));
}

export function decodeCapabilities(data: Uint8Array): ProtocolCapabilities | null {
  try {
    return JSON.parse(new TextDecoder().decode(data)) as ProtocolCapabilities;
  } catch {
    return null;
  }
}

export function intersectCapabilities(
  local: ProtocolCapabilities,
  remote: ProtocolCapabilities,
): ProtocolCapabilities {
  return {
    version: Math.min(local.version, remote.version),
    features: local.features.filter((f) => remote.features.includes(f)),
    supportedTransports: local.supportedTransports.filter((t) =>
      remote.supportedTransports.includes(t),
    ),
  };
}
