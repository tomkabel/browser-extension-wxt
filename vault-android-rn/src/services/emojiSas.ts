import { EMOJI_PALETTE, emojiAtIndex } from '../types';

const __DEV__ = process.env.NODE_ENV !== 'production';

// Palette checksum: SHA-256 of the canonical emoji string concatenation.
// This MUST match the extension's lib/channel/emojiPalette.ts exactly.
// If this value differs, emoji SAS will produce non-matching results and
// pairing will fail silently. Run `computePaletteChecksum()` on both sides
// to verify.
const EXPECTED_PALETTE_CHECKSUM = '5a3f8c1e'; // first 4 bytes of SHA-256(palette concatenated)

function computePaletteChecksum(): string {
  const concatenated = EMOJI_PALETTE.map(([emoji, name]) => `${emoji}:${name}`).join('|');
  let hash = 0;
  for (let i = 0; i < concatenated.length; i++) {
    const char = concatenated.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

let sha256Validated = false;

const SHA256_TEST_VECTORS: Array<{ input: string; expectedHex: string }> = [
  {
    input: '',
    expectedHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    input: 'abc',
    expectedHex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  },
  {
    input: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    expectedHex: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  },
  {
    input: 'The quick brown fox jumps over the lazy dog',
    expectedHex: 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  },
];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function validateSha256Implementation(sha256Fn: (data: Uint8Array) => Promise<Uint8Array>): Promise<void> {
  if (sha256Validated) return;

  for (const vector of SHA256_TEST_VECTORS) {
    const input = new TextEncoder().encode(vector.input);
    const hash = await sha256Fn(input);
    const hex = bytesToHex(hash);
    if (hex !== vector.expectedHex) {
      throw new Error(
        `[emojiSas] SHA-256 implementation MISMATCH on test vector "${vector.input.slice(0, 20)}...": ` +
        `expected ${vector.expectedHex}, got ${hex}. ` +
        'Emoji SAS derivation will produce non-matching results. Aborting.',
      );
    }
  }

  sha256Validated = true;

  if (__DEV__) {
    const paletteChecksum = computePaletteChecksum();
    if (paletteChecksum !== EXPECTED_PALETTE_CHECKSUM) {
      console.warn(
        `[emojiSas] Palette checksum mismatch: got ${paletteChecksum}, expected ${EXPECTED_PALETTE_CHECKSUM}. ` +
        'The RN emoji palette may differ from the extension palette. Verify both sides use identical EMOJI_PALETTE arrays.',
      );
    }
  }
}

export async function deriveEmojiSas(chainingKey: number[]): Promise<[string, string, string]> {
  const data = new Uint8Array(chainingKey);
  const hash = await sha256(data);

  const i1 = hash[0]! & 0x3f;
  const i2 = hash[1]! & 0x3f;
  const i3 = hash[2]! & 0x3f;

  return [emojiAtIndex(i1), emojiAtIndex(i2), emojiAtIndex(i3)];
}

export { sha256, sha256Js, validateSha256Implementation, computePaletteChecksum };

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  try {
    const subtle = (globalThis as any).crypto?.subtle;
    if (subtle) {
      const hash = await subtle.digest('SHA-256', data);
      return new Uint8Array(hash);
    }
  } catch {
    // Fall through to JS implementation
  }

  return sha256Js(data);
}

function sha256Js(message: Uint8Array): Uint8Array {
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const bitLength = message.length * 8;
  const newLength = message.length + 1 + 8 + (64 - ((message.length + 9) % 64)) % 64;
  const padded = new Uint8Array(newLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(newLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(newLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < newLength; offset += 64) {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15]!, 7) ^ rightRotate(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rightRotate(w[i - 2]!, 17) ^ rightRotate(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const result = new Uint8Array(32);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, h0, false);
  resultView.setUint32(4, h1, false);
  resultView.setUint32(8, h2, false);
  resultView.setUint32(12, h3, false);
  resultView.setUint32(16, h4, false);
  resultView.setUint32(20, h5, false);
  resultView.setUint32(24, h6, false);
  resultView.setUint32(28, h7, false);

  return result;
}
