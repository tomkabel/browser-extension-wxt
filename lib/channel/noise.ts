import {
  Handshake,
  Noise_25519_ChaChaPoly_BLAKE2s,
  lookupPattern,
  INTERNALS,
  type TransportState,
} from 'salty-crypto';
import type {
  CachedPairing,
  NoiseKeyPair,
  NoiseSession,
  ProtocolCapabilities,
} from '~/lib/channel/noiseTypes';

export type { ProtocolCapabilities };

export type { NoiseKeyPair, NoiseSession, CachedPairing };

const ALGORITHMS = Noise_25519_ChaChaPoly_BLAKE2s;

function keyToBytes(kp: NoiseKeyPair): number[] {
  return [...Array.from(kp.publicKey), ...Array.from(kp.secretKey)];
}

function keyFromBytes(bytes: number[]): NoiseKeyPair {
  const pubLen = ALGORITHMS.dh.DHLEN;
  return {
    publicKey: new Uint8Array(bytes.slice(0, pubLen)),
    secretKey: new Uint8Array(bytes.slice(pubLen, pubLen * 2)),
  };
}

export function generateKeyPair(): NoiseKeyPair {
  const kp = ALGORITHMS.dh.generateKeypair();
  return {
    publicKey: kp.public,
    secretKey: kp.secret,
  };
}

export function serializeKeyPair(kp: NoiseKeyPair): number[] {
  return keyToBytes(kp);
}

export function deserializeKeyPair(bytes: number[]): NoiseKeyPair {
  return keyFromBytes(bytes);
}

export function toCachedPairing(
  localKey: NoiseKeyPair,
  remotePublicKey: Uint8Array,
  handshakePattern: 'XX' | 'IK',
): CachedPairing {
  return {
    localStaticKey: keyToBytes(localKey),
    remoteStaticPublicKey: Array.from(remotePublicKey),
    handshakePattern,
    pairedAt: Date.now(),
  };
}

export function fromCachedPairing(cached: CachedPairing): {
  localStaticKey: NoiseKeyPair;
  remoteStaticPublicKey: Uint8Array;
} {
  return {
    localStaticKey: keyFromBytes(cached.localStaticKey),
    remoteStaticPublicKey: new Uint8Array(cached.remoteStaticPublicKey),
  };
}

export async function completeIKHandshake(
  localStaticKey: NoiseKeyPair,
  remoteStaticPublicKey: Uint8Array,
  writePacket: (packet: Uint8Array) => Promise<void>,
  readPacket: () => Promise<Uint8Array>,
): Promise<TransportState> {
  const pattern = lookupPattern('IK')!;

  const handshake = new Handshake(ALGORITHMS, pattern, 'initiator', {
    staticKeypair: {
      public: localStaticKey.publicKey,
      secret: localStaticKey.secretKey,
    },
    remoteStaticPublicKey,
  });

  return handshake.completeHandshake(writePacket, readPacket);
}

export function createXXHandshake(localStaticKey: NoiseKeyPair): Handshake {
  const pattern = lookupPattern('XX')!;
  return new Handshake(ALGORITHMS, pattern, 'initiator', {
    staticKeypair: {
      public: localStaticKey.publicKey,
      secret: localStaticKey.secretKey,
    },
  });
}

export function createIKHandshake(
  localStaticKey: NoiseKeyPair,
  remoteStaticPublicKey: Uint8Array,
): Handshake {
  const pattern = lookupPattern('IK')!;
  return new Handshake(ALGORITHMS, pattern, 'initiator', {
    staticKeypair: {
      public: localStaticKey.publicKey,
      secret: localStaticKey.secretKey,
    },
    remoteStaticPublicKey,
  });
}

export function createResponderXXHandshake(localStaticKey: NoiseKeyPair): Handshake {
  const pattern = lookupPattern('XX')!;
  return new Handshake(ALGORITHMS, pattern, 'responder', {
    staticKeypair: {
      public: localStaticKey.publicKey,
      secret: localStaticKey.secretKey,
    },
  });
}

export function createResponderIKHandshake(localStaticKey: NoiseKeyPair): Handshake {
  const pattern = lookupPattern('IK')!;
  return new Handshake(ALGORITHMS, pattern, 'responder', {
    staticKeypair: {
      public: localStaticKey.publicKey,
      secret: localStaticKey.secretKey,
    },
  });
}

export function createNoiseSession(
  transport: TransportState,
  localStaticKey: NoiseKeyPair,
  remoteStaticPublicKey: Uint8Array | undefined,
  handshakePattern: 'XX' | 'IK',
): NoiseSession {
  return {
    transport,
    localStaticKey,
    remoteStaticPublicKey,
    handshakePattern,
  };
}

export function deriveNoiseKeypair(seed32: Uint8Array): NoiseKeyPair {
  const secretKey = new Uint8Array(seed32);
  const publicKey = INTERNALS.dh.x25519.scalarMultBase(secretKey);
  return { publicKey, secretKey };
}

export function encryptMessage(session: NoiseSession, plaintext: Uint8Array): Uint8Array {
  return session.transport.send.encrypt(plaintext);
}

export function decryptMessage(session: NoiseSession, ciphertext: Uint8Array): Uint8Array {
  return session.transport.recv.decrypt(ciphertext);
}
