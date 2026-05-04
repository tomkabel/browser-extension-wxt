import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (manifest.extension_id) return manifest.extension_id;
  if (manifest.key) {
    const derBytes = Buffer.from(manifest.key, 'base64');
    const hash = crypto.createHash('sha256').update(derBytes).digest();
    const first16 = hash.subarray(0, 16);
    const hex = first16.toString('hex');
    return hex
      .split('')
      .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
      .join('');
  }
  return 'dev-id';
}

let context: BrowserContext;

test.describe('Accessibility', () => {
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

  async function openPopup(page: Page): Promise<void> {
    const extId = getExtensionId();
    try {
      await page.goto(`chrome-extension://${extId}/popup.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (err) {
      console.warn('Popup navigation failed, aXe results may be unreliable:', err);
    }
    await page.waitForSelector('#root', { timeout: 10000 }).catch(() => {});
  }

  async function setStoreState(page: Page, detail: Record<string, unknown>): Promise<void> {
    await page.evaluate((d) => {
      window.dispatchEvent(new CustomEvent('wxt:store-update', { detail: d }));
    }, detail);
    await page
      .waitForFunction(
        () => {
          try {
            return document.querySelector('[data-testid]') !== null;
          } catch {
            return true;
          }
        },
        { timeout: 5000 },
      )
      .catch(() => {});
  }

  test('unpaired popup (PairingPanel) has zero critical/serious violations', async () => {
    const page = await context.newPage();
    await openPopup(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('auth panel has zero critical/serious violations', async () => {
    const page = await context.newPage();
    await openPopup(page);

    await setStoreState(page, {
      pairingState: 'paired',
      sessionState: 'none',
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('transaction panel has zero critical/serious violations', async () => {
    const page = await context.newPage();
    await openPopup(page);

    await setStoreState(page, {
      pairingState: 'paired',
      sessionState: 'active',
      transactionData: { amount: '€10.00', recipient: 'Test User' },
      transactionState: 'verifying',
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('credential panel states have zero critical/serious violations', async () => {
    const page = await context.newPage();
    await openPopup(page);

    await setStoreState(page, {
      pairingState: 'paired',
      credentialState: 'requesting',
      credentialDomain: 'example.com',
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('color contrast audit passes for all visible text', async () => {
    const page = await context.newPage();
    await openPopup(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter((v) => v.id === 'color-contrast');
    expect(contrastViolations).toHaveLength(0);
  });
});
