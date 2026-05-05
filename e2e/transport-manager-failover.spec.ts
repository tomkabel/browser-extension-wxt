import { test, expect, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { startMockHost, type MockHostHandle } from './helpers';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.extension_id || manifest.key?.slice(0, 32).replace(/[^a-z]/gi, '') || 'dev-id';
}

let context: BrowserContext;
let mockHost: MockHostHandle | null = null;

test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(EXTENSION_DIR)) {
    test.skip(true, 'Extension not built — run `bun run build` first');
    return;
  }

  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
});

test.afterAll(async () => {
  if (mockHost) {
    await mockHost.cleanup();
    mockHost = null;
  }
  await context?.close();
});

test.describe('Transport Manager Failover — E2E', () => {
  test('mock native host starts, writes manifest, and responds to ping', async () => {
    mockHost = await startMockHost();

    expect(mockHost.hostName).toMatch(/^org\.smartid\.mock_host_/);
    expect(fs.existsSync(mockHost.manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(mockHost.manifestPath, 'utf-8'));
    expect(manifest.name).toBe(mockHost.hostName);
    expect(manifest.type).toBe('stdio');
    expect(manifest.allowed_origins).toContain('chrome-extension://*/');
  });

  test('setting mockNativeHostManifest flag makes USB appear available to extension', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForSelector('body', { timeout: 5000 });

    // Set the mock flag
    await page.evaluate(async (manifestPath) => {
      await chrome.storage.local.set({ mockNativeHostManifest: manifestPath });
    }, mockHost?.manifestPath ?? '/tmp/mock.json');

    // Query transport state — USB should appear available
    const result = await page.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'transport-changed',
        payload: null,
      });
      return response;
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.usbAvailable).toBe(true);

    // Cleanup
    await page.evaluate(async () => {
      await chrome.storage.local.remove('mockNativeHostManifest');
    });

    await page.close();
  });

  test('USB disconnect simulation does not crash the popup', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForSelector('body', { timeout: 5000 });

    // Simulate USB disconnect event
    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'transport-changed',
        payload: { current: 'webrtc', previous: 'usb', reason: 'USB disconnected' },
      });
    });

    await page.waitForTimeout(500);

    const bodyText = await page.textContent('body').catch(() => '');
    expect(bodyText).toBeTruthy();

    const crashErrors = errors.filter(
      (e) => e.includes('TypeError') || e.includes('ReferenceError'),
    );
    expect(crashErrors).toHaveLength(0);

    await page.close();
  });

  test('connection state query returns valid transport type after init', async () => {
    const page = await context.newPage();
    const extId = getExtensionId();

    await page.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForSelector('body', { timeout: 5000 });

    const result = await page.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'get-connection-state',
        payload: null,
      });
      return response;
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(typeof result.data.connectionState).toBe('string');
    expect(['connected', 'disconnected', 'connecting']).toContain(result.data.connectionState);

    await page.close();
  });
});
