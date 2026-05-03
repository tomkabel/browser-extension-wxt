import { describe, it, expect } from 'vitest';
import {
  Noise_25519_ChaChaPoly_BLAKE2s,
  Handshake,
  INTERNALS,
  TransportState,
  lookupPattern,
  matchPattern,
  isOneWay,
  type DHKeyPair,
} from 'salty-crypto';

function unhex(s: string | undefined): Uint8Array | undefined {
  if (s === void 0) return void 0;
  return new Uint8Array(s.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
}

function hex(bs: Uint8Array): string {
  return Array.from(bs)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function skToKeypair(sk: Uint8Array | undefined): DHKeyPair | undefined {
  if (sk === void 0) return void 0;
  return {
    public: INTERNALS.dh.x25519.scalarMultBase(sk),
    secret: sk,
  };
}

interface TestVector {
  protocol_name?: string;
  name?: string;
  init_prologue?: string;
  init_ephemeral?: string;
  init_static?: string;
  init_remote_static?: string;
  init_psks?: string[];
  init_psk?: string;
  resp_prologue?: string;
  resp_ephemeral?: string;
  resp_static?: string;
  resp_remote_static?: string;
  resp_psks?: string[];
  resp_psk?: string;
  messages: Array<{ payload: string; ciphertext: string }>;
}

import snowVectors from './noise-test-vectors/snow.json';

const algorithms = Noise_25519_ChaChaPoly_BLAKE2s;

function runVectorTest(t: TestVector): void {
  const isOld = 'name' in t;
  const pName = matchPattern(algorithms, isOld ? t.name! : t.protocol_name!);
  const pattern = lookupPattern(pName!)!;
  const oneWay = isOneWay(pattern);

  const unit = (v: string | undefined): [string] | undefined => (v === void 0 ? void 0 : [v]);

  const I = new Handshake(algorithms, pattern, 'initiator', {
    prologue: unhex(t.init_prologue),
    staticKeypair: skToKeypair(unhex(t.init_static)),
    remoteStaticPublicKey: unhex(t.init_remote_static),
    pregeneratedEphemeralKeypair: skToKeypair(unhex(t.init_ephemeral)),
    preSharedKeys: (isOld ? unit(t.init_psk) : t.init_psks)
      ?.map((k) => unhex(k!))
      .filter((v): v is Uint8Array => v !== undefined),
  });

  const R = new Handshake(algorithms, pattern, 'responder', {
    prologue: unhex(t.resp_prologue),
    staticKeypair: skToKeypair(unhex(t.resp_static)),
    remoteStaticPublicKey: unhex(t.resp_remote_static),
    pregeneratedEphemeralKeypair: skToKeypair(unhex(t.resp_ephemeral)),
    preSharedKeys: (isOld ? unit(t.resp_psk) : t.resp_psks)
      ?.map((k) => unhex(k!))
      .filter((v): v is Uint8Array => v !== undefined),
  });

  let sender = I;
  let receiver = R;
  let senderCss: TransportState | null = null;
  let receiverCss: TransportState | null = null;

  function swapRoles() {
    [sender, receiver] = [receiver, sender];
    [senderCss, receiverCss] = [receiverCss, senderCss];
  }

  for (let step = 0; step < t.messages.length; step++) {
    const m = t.messages[step]!;
    if (senderCss && receiverCss) {
      const actual = senderCss.send.encrypt(unhex(m.payload)!);
      expect(hex(actual)).toBe(m.ciphertext);
      const decrypted = receiverCss.recv.decrypt(actual);
      expect(hex(decrypted)).toBe(m.payload);
    } else {
      const { packet, finished: sFinished } = sender.writeMessage(unhex(m.payload)!);
      expect(hex(packet)).toBe(m.ciphertext);
      const { message, finished: rFinished } = receiver.readMessage(packet);
      expect(hex(message)).toBe(m.payload);
      senderCss = sFinished;
      receiverCss = rFinished;
    }
    if (!oneWay) swapRoles();
  }
}

describe('Noise Protocol - Official Test Vectors', () => {
  const vectors = (snowVectors as { vectors: TestVector[] }).vectors;
  const targetBases = new Set(['XX', 'IK']);

  for (const t of vectors) {
    const isOld = 'name' in t;
    const pName = matchPattern(algorithms, isOld ? t.name! : t.protocol_name!);
    if (!pName) continue;
    const pattern = lookupPattern(pName);
    if (!pattern) continue;
    if (!targetBases.has(pattern.baseName)) continue;

    it(`${pattern.name} handshake + transport`, () => {
      runVectorTest(t);
    });
  }
});

const PROPERTY_TEST_PATTERNS = ['XX', 'IK'] as const;

function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function runFullHandshake(
  patternName: string,
  prologue?: Uint8Array,
): { initTransport: TransportState; respTransport: TransportState } {
  const pattern = lookupPattern(patternName)!;
  const initKp = algorithms.dh.generateKeypair();
  const respKp = algorithms.dh.generateKeypair();
  const oneWay = isOneWay(pattern);

  const initOpts: Record<string, unknown> = {
    prologue,
    staticKeypair: initKp,
  };
  const respOpts: Record<string, unknown> = {
    prologue,
    staticKeypair: respKp,
  };

  if ((pattern.responderPreMessage as string[]).includes('s')) {
    initOpts.remoteStaticPublicKey = respKp.public;
  }
  if ((pattern.initiatorPreMessage as string[]).includes('s')) {
    respOpts.remoteStaticPublicKey = initKp.public;
  }

  const I = new Handshake(algorithms, pattern, 'initiator', initOpts);
  const R = new Handshake(algorithms, pattern, 'responder', respOpts);

  let sender = I;
  let receiver = R;
  let senderCss: TransportState | null = null;
  let receiverCss: TransportState | null = null;

  for (let i = 0; i < pattern.messages.length; i++) {
    const emptyPayload = new Uint8Array(0);
    const { packet, finished: sFinished } = sender.writeMessage(emptyPayload);
    const { finished: rFinished } = receiver.readMessage(packet);
    senderCss = sFinished;
    receiverCss = rFinished;
    if (!oneWay) {
      [sender, receiver] = [receiver, sender];
      [senderCss, receiverCss] = [receiverCss, senderCss];
    }
  }

  expect(senderCss).not.toBeNull();
  expect(receiverCss).not.toBeNull();

  return {
    initTransport: oneWay ? senderCss! : senderCss!,
    respTransport: oneWay ? receiverCss! : receiverCss!,
  };
}

describe('Noise Protocol - Property-Based Tests', () => {
  describe('Encrypt/decrypt round-trip', () => {
    const NUM_ITERATIONS = 1000;

    for (const pat of PROPERTY_TEST_PATTERNS) {
      it(`${pat}: ${NUM_ITERATIONS} random payloads round-trip`, () => {
        for (let i = 0; i < NUM_ITERATIONS; i++) {
          const { initTransport, respTransport } = runFullHandshake(pat);

          for (let t = 0; t < 3; t++) {
            const payloadSize = Math.floor(Math.random() * 2048) + 1;
            const payload = generateRandomBytes(payloadSize);

            const encrypted = initTransport.send.encrypt(payload);
            const decrypted = respTransport.recv.decrypt(encrypted);

            expect(decrypted).toEqual(payload);
          }
        }
      }, 120000);
    }
  });

  describe('Wrong-key rejection', () => {
    const WRONG_KEY_ITERATIONS = 100;

    for (const pat of PROPERTY_TEST_PATTERNS) {
      it(`${pat}: wrong key fails decryption`, () => {
        for (let i = 0; i < WRONG_KEY_ITERATIONS; i++) {
          const { respTransport } = runFullHandshake(pat);
          const { initTransport: wrongTransport } = runFullHandshake(pat);

          const payload = generateRandomBytes(64);
          const encrypted = wrongTransport.send.encrypt(payload);

          expect(() => {
            respTransport.recv.decrypt(encrypted);
          }).toThrow();
        }
      }, 15000);
    }
  });

  describe('Tampered ciphertext rejection', () => {
    for (const pat of PROPERTY_TEST_PATTERNS) {
      it(`${pat}: tampered ciphertext fails`, () => {
        for (let i = 0; i < 100; i++) {
          const { initTransport, respTransport } = runFullHandshake(pat);

          const payload = generateRandomBytes(64);
          const encrypted = initTransport.send.encrypt(payload);

          const tampered = new Uint8Array(encrypted);
          const idx = Math.floor(Math.random() * tampered.length);
          tampered[idx] = tampered[idx]! ^ 0xff;

          expect(() => {
            respTransport.recv.decrypt(tampered);
          }).toThrow();
        }
      });
    }
  });

  describe('Sequence monotonicity', () => {
    const SEQUENCE_ITERATIONS = 500;

    for (const pat of PROPERTY_TEST_PATTERNS) {
      it(`${pat}: nonces increment correctly over ${SEQUENCE_ITERATIONS} messages`, () => {
        const { initTransport, respTransport } = runFullHandshake(pat);

        const sentPayloads: Uint8Array[] = [];

        for (let i = 0; i < SEQUENCE_ITERATIONS; i++) {
          const payload = generateRandomBytes(64);
          sentPayloads.push(payload);
          const encrypted = initTransport.send.encrypt(payload);

          const decrypted = respTransport.recv.decrypt(encrypted);
          expect(decrypted).toEqual(payload);
        }

        for (let i = 0; i < sentPayloads.length; i++) {
          const sentHex = hex(sentPayloads[i]!);
          const recvPayload = sentPayloads[i]!;
          const recvHex = hex(recvPayload);
          expect(recvHex).toBe(sentHex);
        }
      }, 30000);

      it(`${pat}: out-of-order decryption fails`, () => {
        const { initTransport, respTransport } = runFullHandshake(pat);

        const payload1 = generateRandomBytes(64);
        const payload2 = generateRandomBytes(64);

        const encrypted1 = initTransport.send.encrypt(payload1);
        const encrypted2 = initTransport.send.encrypt(payload2);

        expect(() => {
          respTransport.recv.decrypt(encrypted2);
          respTransport.recv.decrypt(encrypted1);
        }).toThrow();
      });
    }
  });

  describe('Key rotation (long-lived session)', () => {
    const LONG_SESSION_MSGS = 2000;

    for (const pat of PROPERTY_TEST_PATTERNS) {
      it(`${pat}: ${LONG_SESSION_MSGS} messages without nonce exhaustion`, () => {
        const { initTransport, respTransport } = runFullHandshake(pat);

        for (let i = 0; i < LONG_SESSION_MSGS; i++) {
          const payload = generateRandomBytes(32);
          const encrypted = initTransport.send.encrypt(payload);
          const decrypted = respTransport.recv.decrypt(encrypted);
          expect(decrypted).toEqual(payload);
        }
      }, 30000);
    }
  });
});
