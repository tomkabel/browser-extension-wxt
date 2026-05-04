import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const id = manifest.extension_id || manifest.key?.slice(0, 32).replace(/[^a-z]/gi, '');
  if (!id) {
    throw new Error(
      `Cannot resolve extension ID from ${manifestPath}: missing "extension_id" and "key" fields`,
    );
  }
  return id;
}

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(EXTENSION_DIR)) {
    test.skip(true, 'Extension not built — run `bun run build` first');
    return;
  }

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Pairing UI Smoke Tests', () => {
  test.afterEach(async () => {
    await page?.close().catch(() => {});
  });

  test.beforeEach(async () => {
    const extId = getExtensionId();
    page = await context.newPage();
    try {
      await page.goto(`chrome-extension://${extId}/popup.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (err) {
      throw new Error(
        `Failed to navigate to popup.html (extId=${extId}): ${err instanceof Error ? err.message : err}`,
      );
    }
    const popupContent = page.locator('#app');
    await expect(popupContent).toBeVisible({ timeout: 5000 });
  });

  test('shows Pair Phone button in unpaired state', async () => {
    const pairButton = page.locator('button', { hasText: 'Pair Phone' });
    await expect(pairButton).toBeVisible({ timeout: 5000 });
  });

  test('clicking Pair Phone shows QR panel with canvas and SAS mode toggle', async () => {
    const pairButton = page.locator('button', { hasText: 'Pair Phone' });
    await expect(pairButton).toBeVisible({ timeout: 5000 });
    await pairButton.click();

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 5000 });

    const toggleButton = page.locator('button', { hasText: 'Use digits instead' });
    await expect(toggleButton).toBeVisible({ timeout: 5000 });
  });

  test('SAS mode toggle switches between emoji and numeric display', async () => {
    const pairButton = page.locator('button', { hasText: 'Pair Phone' });
    await pairButton.click();

    const useDigitsButton = page.locator('button', { hasText: 'Use digits instead' });
    await expect(useDigitsButton).toBeVisible({ timeout: 5000 });
    await useDigitsButton.click();

    const useEmojiButton = page.locator('button', { hasText: 'Use emoji instead' });
    await expect(useEmojiButton).toBeVisible({ timeout: 5000 });

    const sasCode = page.locator('text=Verification code');
    await expect(sasCode).toBeVisible({ timeout: 5000 });
  });

  test('pairing panel has Cancel button to return to unpaired state', async () => {
    const pairButton = page.locator('button', { hasText: 'Pair Phone' });
    await pairButton.click();

    const cancelButton = page.locator('button', { hasText: 'Cancel' });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();

    const pairButtonAgain = page.locator('button', { hasText: 'Pair Phone' });
    await expect(pairButtonAgain).toBeVisible({ timeout: 5000 });
  });
});
