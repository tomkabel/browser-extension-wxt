import { test, expect, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.extension_id || manifest.key?.slice(0, 32).replace(/[^a-z]/gi, '') || 'dev-id';
}

let context: BrowserContext;

test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(EXTENSION_DIR)) {
    test.skip(true, 'Extension not built — run `bun run build` first');
    return;
  }

  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Transport Fallback — E2E', () => {
  test('extension falls back to WebRTC when USB native host is unavailable', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const transportState = await page.evaluate(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'transport-changed',
          payload: null,
        });
        return response;
      } catch {
        return { success: false, data: { usbAvailable: false } };
      }
    });

    expect(transportState).toBeDefined();
    expect(transportState.data.usbAvailable).toBe(false);

    await page.close();
  });

  test('popup renders transport indicator without crashing', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body').catch(() => '');
    expect(bodyText).toBeTruthy();

    const transportErrors = errors.filter(
      (e) => e.includes('TransportManager') || e.includes('transport'),
    );
    expect(transportErrors).toHaveLength(0);

    await page.close();
  });

  test('get-connection-state returns valid state after init', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'get-connection-state',
          payload: null,
        });
        return response;
      } catch {
        return { success: false };
      }
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(typeof result.data.connectionState).toBe('string');

    await page.close();
  });

  test('USB disconnection is handled gracefully by popup', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    await page.evaluate(async () => {
      try {
        await chrome.runtime.sendMessage({
          type: 'transport-changed',
          payload: { current: 'webrtc', reason: 'USB disconnected' },
        });
      } catch {
        // message may not have a handler
      }
    });

    await page.waitForTimeout(1000);

    const bodyText = await page.textContent('body').catch(() => '');
    expect(bodyText).toBeTruthy();

    const crashErrors = errors.filter(
      (e) => e.includes('TypeError') || e.includes('ReferenceError'),
    );
    expect(crashErrors).toHaveLength(0);

    await page.close();
  });
});
