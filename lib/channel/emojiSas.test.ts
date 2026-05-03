import { describe, it, expect } from 'vitest';
import { deriveEmojiSas } from './emojiSas';
import { EMOJI_PALETTE, emojiAtIndex } from './emojiPalette';

describe('emojiPalette', () => {
  it('has exactly 64 emoji', () => {
    expect(EMOJI_PALETTE).toHaveLength(64);
  });

  it('all emoji are single codepoints (no ZWJ or modifiers)', () => {
    for (const [emoji] of EMOJI_PALETTE) {
      expect(emoji.length).toBeLessThanOrEqual(2);
    }
  });

  it('emojiAtIndex returns the correct emoji', () => {
    for (let i = 0; i < 64; i++) {
      expect(emojiAtIndex(i)).toBe(EMOJI_PALETTE[i]![0]);
    }
  });

  it('emojiAtIndex throws for out-of-range', () => {
    expect(() => emojiAtIndex(-1)).toThrow(RangeError);
    expect(() => emojiAtIndex(64)).toThrow(RangeError);
  });
});

describe('deriveEmojiSas', () => {
  it('same key produces same emoji', async () => {
    const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const result1 = await deriveEmojiSas(key);
    const result2 = await deriveEmojiSas(key);
    expect(result1).toEqual(result2);
  });

  it('different key produces different emoji', async () => {
    const key1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const key2 = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]);
    const result1 = await deriveEmojiSas(key1);
    const result2 = await deriveEmojiSas(key2);
    expect(result1).not.toEqual(result2);
  });

  it('returns exactly 3 emoji', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const result = await deriveEmojiSas(key);
    expect(result).toHaveLength(3);
  });

  it('all returned emoji are from the palette', async () => {
    const paletteSet = new Set(EMOJI_PALETTE.map(([e]) => e));
    const key = crypto.getRandomValues(new Uint8Array(32));
    const result = await deriveEmojiSas(key);
    for (const emoji of result) {
      expect(paletteSet.has(emoji)).toBe(true);
    }
  });

  it('is deterministic across multiple calls', async () => {
    const key = new Uint8Array(32).fill(0xab);
    const a = await deriveEmojiSas(key);
    const b = await deriveEmojiSas(key);
    const c = await deriveEmojiSas(key);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
