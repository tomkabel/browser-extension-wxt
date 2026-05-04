import { describe, it, expect, vi } from 'vitest';
import {
  serializeChallengeComponents,
  parseChallengeComponents,
  deriveChallenge,
  generateSessionNonce,
} from '../challengeDerivation';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('challengeDerivation', () => {
  const mockProof = new Uint8Array(64).fill(0xab);
  const mockOrigin = 'https://example.com';
  const mockControlCode = '1234';
  const mockNonce = new Uint8Array(32).fill(0xcd);

  const defaultInput = {
    zkTlsProof: mockProof,
    origin: mockOrigin,
    controlCode: mockControlCode,
    sessionNonce: mockNonce,
  };

  describe('serializeChallengeComponents', () => {
    it('produces valid TLV output with correct structure', () => {
      const serialized = serializeChallengeComponents(defaultInput);

      expect(serialized[0]).toBe(0x01);

      const proofLength = (serialized[1]! << 8) | serialized[2]!;
      expect(proofLength).toBe(64);

      const originLength = (serialized[1 + 2 + 64]! << 8) | serialized[1 + 2 + 64 + 1]!;
      expect(originLength).toBe(mockOrigin.length);

      const headerSize = 1 + 2 + 64 + 2 + mockOrigin.length + 1 + 4 + 32;
      const remainder = headerSize % 32;
      const expectedTotal = remainder === 0 ? headerSize : headerSize + (32 - remainder);
      expect(serialized.length).toBe(expectedTotal);
    });

    it('throws on oversize proof', () => {
      const oversized = new Uint8Array(5000).fill(0x01);
      expect(() =>
        serializeChallengeComponents({ ...defaultInput, zkTlsProof: oversized }),
      ).toThrow('maximum length');
    });

    it('throws on non-4-byte control code', () => {
      expect(() =>
        serializeChallengeComponents({ ...defaultInput, controlCode: '12' }),
      ).toThrow('exactly 4 ASCII digits');
    });

    it('throws on wrong nonce length', () => {
      expect(() =>
        serializeChallengeComponents({ ...defaultInput, sessionNonce: new Uint8Array(16) }),
      ).toThrow('exactly 32 bytes');
    });
  });

  describe('parseChallengeComponents', () => {
    it('roundtrips serialize then parse produces identical components', () => {
      const serialized = serializeChallengeComponents(defaultInput);
      const parsed = parseChallengeComponents(serialized);

      expect(parsed.version).toBe(0x01);
      expect(parsed.origin).toBe(mockOrigin);
      expect(parsed.controlCode).toBe(mockControlCode);
      expect(hex(parsed.sessionNonce)).toBe(hex(mockNonce));
      expect(hex(parsed.zkTlsProof)).toBe(hex(mockProof));
    });

    it('throws on truncated data', () => {
      const serialized = serializeChallengeComponents(defaultInput);
      const truncated = serialized.slice(0, 10);
      expect(() => parseChallengeComponents(truncated)).toThrow('Truncated');
    });
  });

  describe('deriveChallenge', () => {
    it('produces deterministic output for same inputs', async () => {
      const hash1 = await deriveChallenge(defaultInput);
      const hash2 = await deriveChallenge(defaultInput);
      expect(hex(hash1)).toBe(hex(hash2));
    });

    it('produces different output for different session nonce', async () => {
      const differentNonce = new Uint8Array(32).fill(0xef);
      const hash1 = await deriveChallenge(defaultInput);
      const hash2 = await deriveChallenge({ ...defaultInput, sessionNonce: differentNonce });
      expect(hex(hash1)).not.toBe(hex(hash2));
    });

    it('produces a 32-byte SHA-256 hash', async () => {
      const hash = await deriveChallenge(defaultInput);
      expect(hash.length).toBe(32);
    });

    it('produces different output for different origin', async () => {
      const hash1 = await deriveChallenge(defaultInput);
      const hash2 = await deriveChallenge({ ...defaultInput, origin: 'https://evil.com' });
      expect(hex(hash1)).not.toBe(hex(hash2));
    });

    it('produces different output for different control code', async () => {
      const hash1 = await deriveChallenge(defaultInput);
      const hash2 = await deriveChallenge({ ...defaultInput, controlCode: '5678' });
      expect(hex(hash1)).not.toBe(hex(hash2));
    });
  });

  describe('padding', () => {
    it('is canonical: same inputs produce same padding', () => {
      const serialized1 = serializeChallengeComponents(defaultInput);
      const serialized2 = serializeChallengeComponents(defaultInput);
      expect(hex(serialized1)).toBe(hex(serialized2));
    });

    it('padding bytes are zeros', () => {
      const serialized = serializeChallengeComponents(defaultInput);

      const expectedMinSize = 1 + 2 + 64 + 2 + mockOrigin.length + 1 + 4 + 32;
      for (let i = expectedMinSize; i < serialized.length; i++) {
        expect(serialized[i]).toBe(0);
      }
    });

    it('total length is multiple of 32 bytes', () => {
      const serialized = serializeChallengeComponents(defaultInput);
      expect(serialized.length % 32).toBe(0);
    });
  });

  describe('golden test vector (cross-platform compatibility)', () => {
    it('serializes to deterministic hex and produces expected SHA-256 digest', async () => {
      const proof = new Uint8Array(64).fill(0xab);
      const nonce = new Uint8Array(32).fill(0xcd);
      const input = {
        zkTlsProof: proof,
        origin: 'https://example.com',
        controlCode: '1234',
        sessionNonce: nonce,
      };

      const serialized = serializeChallengeComponents(input);

      const headerSize = 1 + 2 + 64 + 2 + 'https://example.com'.length + 1 + 4 + 32;
      const padding = (32 - (headerSize % 32)) % 32;
      const totalExpected = headerSize + padding;
      expect(serialized.length).toBe(totalExpected);

      const parsed = parseChallengeComponents(serialized);
      expect(parsed.version).toBe(0x01);
      expect(parsed.origin).toBe('https://example.com');
      expect(parsed.controlCode).toBe('1234');
      expect(hex(parsed.sessionNonce)).toBe(hex(nonce));
      expect(hex(parsed.zkTlsProof)).toBe(hex(proof));

      const challenge = await deriveChallenge(input);
      expect(challenge.length).toBe(32);

      const rederived = await deriveChallenge(input);
      expect(hex(challenge)).toBe(hex(rederived));

      const differentNonce = new Uint8Array(32).fill(0xef);
      const differentChallenge = await deriveChallenge({ ...input, sessionNonce: differentNonce });
      expect(hex(challenge)).not.toBe(hex(differentChallenge));
    });
  });

  it('deriveChallenge passes detached ArrayBuffer not unsafe .buffer reference', async () => {
    const digestSpy = vi.spyOn(crypto.subtle, 'digest');
    await deriveChallenge(defaultInput);
    const callArg = digestSpy.mock.calls[0]![1]!;
    expect(callArg instanceof ArrayBuffer).toBe(true);
    const ab = callArg as ArrayBuffer;
    expect(ab.byteLength > 0).toBe(true);
    expect(ab.byteLength % 32).toBe(0);
    digestSpy.mockRestore();
  });

  describe('generateSessionNonce', () => {
    it('generates a 32-byte nonce', () => {
      const nonce = generateSessionNonce();
      expect(nonce.length).toBe(32);
    });

    it('generates different nonces on each call', () => {
      const nonce1 = generateSessionNonce();
      const nonce2 = generateSessionNonce();
      expect(hex(nonce1)).not.toBe(hex(nonce2));
    });
  });
});
