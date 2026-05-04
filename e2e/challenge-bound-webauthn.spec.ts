import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve(__dirname, '..', '.output', 'chrome-mv3');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

test.describe('Challenge-Bound WebAuthn', () => {
  test.beforeAll(() => {
    const manifestExists = fs.existsSync(MANIFEST_PATH);
    test.skip(!manifestExists, 'Build extension first: bun run build');
  });

  test('popup shows transaction context before biometric prompt', () => {
    test.fixme(true, 'Requires extension loaded with --load-extension=.output/chrome-mv3/');
  });

  test('challenge derivation produces deterministic SHA-256 hash', () => {
    test.fixme(true, 'Requires opening the popup and calling into the extension context');
  });

  test('end-to-end: zkTLS proof to challenge derivation to WebAuthn assertion to transport to Android verification', () => {
    test.fixme(true, 'Requires full system integration including Android Vault');
  });

  test('end-to-end with WebRTC fallback', () => {
    test.fixme(true, 'Requires WebRTC signaling server and Android test harness');
  });
});
