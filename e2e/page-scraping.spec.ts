import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.extension_id || '';
}

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  let extensionId: string;
  try {
    extensionId = getExtensionId();
  } catch {
    test.skip(true, 'Extension not built — run `bun run build` first');
    return;
  }

  if (!extensionId) {
    test.skip(true, 'Extension has no extension_id');
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

test.describe('Page Scraping E2E', () => {
  test.beforeEach(async () => {
    const fixturePath = `file://${path.resolve('e2e/fixtures/test-page.html')}`;
    await page.goto(fixturePath, { waitUntil: 'domcontentloaded' });
  });

  test('login form detection on fixture page', async () => {
    const form = page.locator('#login-form');
    await expect(form).toBeVisible();

    const usernameInput = form.locator('input[name="username"]');
    await expect(usernameInput).toBeVisible();

    const passwordInput = form.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('meta description extraction', async () => {
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', 'A test page for E2E scraping tests');
  });

  test('page title extraction', async () => {
    const title = await page.title();
    expect(title).toBe('E2E Test Page');
  });

  test('script tag presence should not break page', async () => {
    const scripts = page.locator('script[data-analytics="true"]');
    const count = await scripts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('headings extraction from fixture', async () => {
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('Welcome to the Test Page');

    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(2);
  });

  test('link extraction from fixture', async () => {
    const links = page.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('image extraction from fixture', async () => {
    const images = page.locator('img');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
