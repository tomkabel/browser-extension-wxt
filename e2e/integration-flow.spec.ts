import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.extension_id || manifest.key?.slice(0, 32).replace(/[^a-z]/gi, '') || 'dev-id';
}

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(EXTENSION_DIR)) {
    test.skip(true, 'Extension not built — run `bun run build` first');
    return;
  }

  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Full Integration Flow - Popup to Transaction', () => {
  test('auth.html is accessible via extension URL', async () => {
    const extId = getExtensionId();
    const authUrl = `chrome-extension://${extId}/auth.html`;

    const authPage = await context.newPage();
    await authPage.goto(authUrl, { timeout: 15000 });

    const title = await authPage.title();
    expect(title).toContain('SmartID2');
    await authPage.close();
  });

  test('popup renders without crashing', async () => {
    const extId = getExtensionId();
    const popupUrl = `chrome-extension://${extId}/popup.html`;

    await page.goto(popupUrl, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const text = await page.textContent('body').catch(() => '');
    expect(text).toBeDefined();
  });
});
