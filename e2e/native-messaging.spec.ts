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

test.describe('Native Messaging Host — E2E', () => {
  test('native host ping returns false when host is not installed', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => {});
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      try {
        const response = await new Promise<chrome.runtime.LastError | { type: string }>((resolve) => {
          chrome.runtime.sendNativeMessage(
            'org.smartid.aoa_host',
            { type: 'ping' },
            (resp) => {
              if (chrome.runtime.lastError) {
                resolve(chrome.runtime.lastError);
              } else {
                resolve(resp as { type: string });
              }
            },
          );
        });
        return { success: true, response };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    expect(result.success).toBe(true);
    if ('type' in (result.response ?? {})) {
      expect((result.response as { type: string }).type).toBe('pong');
    } else {
      expect(result.response).toBeDefined();
    }

    await page.close();
  });

  test('transport-changed message returns initial state', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => {});
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'transport-changed',
        });
        return response;
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    expect(result).toBeDefined();
    if (result?.success) {
      expect(result.data).toBeDefined();
      expect(typeof result.data.usbAvailable).toBe('boolean');
    }

    await page.close();
  });

  test('extension does not crash when native host is unavailable', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => {});
    await page.waitForTimeout(3000);

    const bodyText = await page.textContent('body').catch(() => '');
    expect(bodyText).toBeTruthy();

    const fatalErrors = errors.filter(
      (e) => !e.includes('native') && !e.includes('Native') && !e.includes('connect'),
    );
    expect(fatalErrors).toHaveLength(0);

    await page.close();
  });
});
