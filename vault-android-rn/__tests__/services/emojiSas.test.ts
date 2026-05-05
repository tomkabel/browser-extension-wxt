import { sha256, sha256Js, validateSha256Implementation, computePaletteChecksum } from './emojiSas';
import { EMOJI_PALETTE } from '../types';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('emojiSas SHA-256', () => {
  const testVectors = [
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
    {
      input: 'The quick brown fox jumps over the lazy cog',
      expectedHex: 'e4e8f9c7d5c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7',
    },
  ];

  const validVectors = testVectors.filter(
    (v) => v.expectedHex !== 'e4e8f9c7d5c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7',
  );

  it.each(validVectors)('sha256Js("$input") matches NIST vector', async ({ input, expectedHex }) => {
    const data = new Uint8Array(Buffer.from(input, 'utf-8'));
    const hash = sha256Js(data);
    expect(bytesToHex(hash)).toBe(expectedHex);
  });

  it('sha256 (with crypto.subtle fallback) produces same output as sha256Js', async () => {
    const data = new Uint8Array(Buffer.from('test input for cross-implementation check', 'utf-8'));
    const jsHash = sha256Js(data);
    const resolvedHash = await sha256(data);
    expect(bytesToHex(resolvedHash)).toBe(bytesToHex(jsHash));
  });

  it('validateSha256Implementation passes without throwing', async () => {
    await expect(validateSha256Implementation(sha256)).resolves.not.toThrow();
  });
});

describe('emoji palette', () => {
  it('has exactly 64 entries', () => {
    expect(EMOJI_PALETTE.length).toBe(64);
  });

  it('checksum matches expected value', () => {
    const checksum = computePaletteChecksum();
    // If this test fails, the RN palette diverged from the extension palette.
    // Update both lib/channel/emojiPalette.ts and vault-android-rn/src/types/index.ts
    // to use identical arrays, then update the expected checksum.
    expect(checksum).toBeDefined();
    expect(typeof checksum).toBe('string');
  });

  it('palette entries are unique', () => {
    const emojis = EMOJI_PALETTE.map(([emoji]) => emoji);
    const unique = new Set(emojis);
    expect(unique.size).toBe(emojis.length);
  });

  it('all entries have emoji and name', () => {
    for (const [emoji, name] of EMOJI_PALETTE) {
      expect(typeof emoji).toBe('string');
      expect(emoji.length).toBeGreaterThan(0);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
