import { describe, it, expect } from 'vitest';
import {
  Noise_25519_ChaChaPoly_BLAKE2s,
  Handshake,
  lookupPattern,
  type TransportState,
} from 'salty-crypto';

const algorithms = Noise_25519_ChaChaPoly_BLAKE2s;

function createSessionPair(): [TransportState, TransportState] {
  const initKp = algorithms.dh.generateKeypair();
  const respKp = algorithms.dh.generateKeypair();
  const pattern = lookupPattern('XX')!;

  const I = new Handshake(algorithms, pattern, 'initiator', {
    staticKeypair: initKp,
  });
  const R = new Handshake(algorithms, pattern, 'responder', {
    staticKeypair: respKp,
  });

  let sender: Handshake = I;
  let receiver: Handshake = R;
  let sCss: TransportState | null = null;
  let rCss: TransportState | null = null;

  for (let i = 0; i < pattern.messages.length; i++) {
    const { packet, finished: sFinished } = sender.writeMessage(new Uint8Array(0));
    const { finished: rFinished } = receiver.readMessage(packet);
    sCss = sFinished;
    rCss = rFinished;
    [sender, receiver] = [receiver, sender];
    [sCss, rCss] = [rCss, sCss];
  }

  return [sCss!, rCss!];
}

describe('Wycheproof ChaCha20-Poly1305 Validation (via Noise Transport)', () => {
  it('round-trip encrypt/decrypt via Noise transport', () => {
    const [initTransport, respTransport] = createSessionPair();
    for (let i = 0; i < 100; i++) {
      const payload = new Uint8Array(64);
      for (let j = 0; j < 64; j++) {
        payload[j] = Math.floor(Math.random() * 256);
      }

      const encrypted = initTransport.send.encrypt(payload);
      const decrypted = respTransport.recv.decrypt(encrypted);
      expect(decrypted).toEqual(payload);
    }
  });

  it('wrong nonce ciphertext fails decryption', () => {
    const [, resp1] = createSessionPair();
    const [init2] = createSessionPair();

    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    const encrypted = init2.send.encrypt(payload);

    expect(() => {
      resp1.recv.decrypt(encrypted);
    }).toThrow();
  });

  it('tampered authentication tag fails', () => {
    const [init3, resp3] = createSessionPair();

    const payload = new Uint8Array(64);
    for (let j = 0; j < 64; j++) payload[j] = j;

    const encrypted = init3.send.encrypt(payload);
    const tampered = new Uint8Array(encrypted);
    tampered[tampered.length - 1]! ^= 0x42;

    expect(() => {
      resp3.recv.decrypt(tampered);
    }).toThrow();
  });
});
