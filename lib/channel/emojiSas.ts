import { emojiAtIndex } from './emojiPalette';

export async function deriveEmojiSas(sessionKey: Uint8Array): Promise<[string, string, string]> {
  const keyBytes = new Uint8Array(sessionKey);
  const hash = await crypto.subtle.digest('SHA-256', keyBytes);
  const bytes = new Uint8Array(hash);

  const i1 = bytes[0]! & 0x3f;
  const i2 = bytes[1]! & 0x3f;
  const i3 = bytes[2]! & 0x3f;

  return [emojiAtIndex(i1), emojiAtIndex(i2), emojiAtIndex(i3)];
}
