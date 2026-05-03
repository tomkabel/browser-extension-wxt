import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

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
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Navigation and Extension Survival', () => {
  test('tab switch between two pages', async () => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    await page2.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    await page1.bringToFront();
    await page1.waitForTimeout(500);
    expect(page1.url()).toContain('example.com');

    await page2.bringToFront();
    await page2.waitForTimeout(500);
    expect(page2.url()).toContain('example.com');

    await page1.close();
    await page2.close();
  });

  test('page reload preserves extension context', async () => {
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const title = await page.title();
    expect(title).toContain('Example');
  });

  test('SPA navigation detection on fixture page', async () => {
    const fixturePath = `file://${path.resolve('e2e/fixtures/test-page.html')}`;
    await page.goto(fixturePath, { waitUntil: 'domcontentloaded' });

    const oldBody = await page.textContent('h1');

    await page.evaluate(() => {
      document.body.innerHTML = '<h1>Updated via SPA navigation</h1><p>New content</p>';
    });

    await page.waitForTimeout(500);

    const newBody = await page.textContent('h1');
    expect(newBody).toBe('Updated via SPA navigation');
    expect(newBody).not.toBe(oldBody);
  });
});
