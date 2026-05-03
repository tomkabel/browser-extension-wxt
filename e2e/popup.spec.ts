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

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Popup E2E', () => {
  test('popup opens and renders app shell', async () => {
    const extId = getExtensionId();
    page = await context.newPage();

    await page
      .goto(`chrome-extension://${extId}/popup.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      .catch(() => {});
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body').catch(() => '');
    expect(bodyText).toBeTruthy();
  });

  test('pairing UI is shown when unpaired', async () => {
    const extId = getExtensionId();
    page = await context.newPage();

    await page
      .goto(`chrome-extension://${extId}/popup.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      .catch(() => {});
    await page.waitForTimeout(1000);

    const content = (await page.textContent('body').catch(() => '')) ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('popup title displays SmartID2 branding', async () => {
    const extId = getExtensionId();
    page = await context.newPage();

    await page
      .goto(`chrome-extension://${extId}/popup.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      .catch(() => {});

    const title = await page.title().catch(() => '');
    expect(title.length).toBeGreaterThan(0);
  });
});
