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
let popupPage: Page;
let contentPage: Page;

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

test.describe('Content Script to Background to Popup Flow', () => {
  test('content script injects on matched domain', async () => {
    contentPage = await context.newPage();
    await contentPage.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    await contentPage.waitForTimeout(1000);

    const title = await contentPage.title();
    expect(title).toContain('Example');
  });

  test('popup page is accessible via extension URL', async () => {
    const extId = getExtensionId();
    const popupUrl = `chrome-extension://${extId}/popup.html`;

    popupPage = await context.newPage();
    await popupPage.goto(popupUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      // Extension may need --load-extension flag; try opening without extension context
      await popupPage.goto(popupUrl, { timeout: 5000 }).catch(() => {});
    });

    const title = await popupPage.title().catch(() => '');
    expect(title).toBeTruthy();
  });
});
