import { describe, it, expect } from 'vitest';
import {
  Noise_25519_ChaChaPoly_BLAKE2s,
  Handshake,
  lookupPattern,
  type TransportState,
} from 'salty-crypto';

const algorithms = Noise_25519_ChaChaPoly_BLAKE2s;

function hex(bs: Uint8Array): string {
  return Array.from(bs)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

describe('Noise XX Interop', () => {
  it('XX handshake produces valid session pair', () => {
    const [initTransport, respTransport] = createSessionPair();

    expect(initTransport).not.toBeNull();
    expect(respTransport).not.toBeNull();

    const payload = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const encrypted = initTransport.send.encrypt(payload);
    const decrypted = respTransport.recv.decrypt(encrypted);

    expect(decrypted).toEqual(payload);
    expect(hex(encrypted)).not.toBe(hex(payload));
  });

  it('XX session pair round-trip bidirectional', () => {
    const [initTransport, respTransport] = createSessionPair();

    for (let i = 0; i < 50; i++) {
      const payload = new Uint8Array(32);
      for (let j = 0; j < 32; j++) payload[j] = Math.floor(Math.random() * 256);

      const encrypted = initTransport.send.encrypt(payload);
      const decrypted = respTransport.recv.decrypt(encrypted);
      expect(decrypted).toEqual(payload);
    }

    for (let i = 0; i < 50; i++) {
      const payload = new Uint8Array(32);
      for (let j = 0; j < 32; j++) payload[j] = Math.floor(Math.random() * 256);

      const encrypted = respTransport.send.encrypt(payload);
      const decrypted = initTransport.recv.decrypt(encrypted);
      expect(decrypted).toEqual(payload);
    }
  });
});

describe('Noise IK Interop', () => {
  it('IK handshake produces valid session with known remote static', () => {
    const initKp = algorithms.dh.generateKeypair();
    const respKp = algorithms.dh.generateKeypair();

    const initPub = new Uint8Array(initKp.public);
    const respPub = new Uint8Array(respKp.public);

    const patternIK = lookupPattern('IK')!;

    const I = new Handshake(algorithms, patternIK, 'initiator', {
      staticKeypair: initKp,
      remoteStaticPublicKey: respPub,
    });

    const R = new Handshake(algorithms, patternIK, 'responder', {
      staticKeypair: respKp,
      remoteStaticPublicKey: initPub,
    });

    let sender = I;
    let receiver = R;
    let sCss: TransportState | null = null;
    let rCss: TransportState | null = null;

    for (let i = 0; i < patternIK.messages.length; i++) {
      const { packet, finished: sFinished } = sender.writeMessage(new Uint8Array(0));
      const { finished: rFinished } = receiver.readMessage(packet);
      sCss = sFinished;
      rCss = rFinished;
      [sender, receiver] = [receiver, sender];
      [sCss, rCss] = [rCss, sCss];
    }

    expect(sCss).not.toBeNull();
    expect(rCss).not.toBeNull();

    const payload = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const encrypted = sCss!.send.encrypt(payload);
    const decrypted = rCss!.recv.decrypt(encrypted);
    expect(decrypted).toEqual(payload);
  });
});
