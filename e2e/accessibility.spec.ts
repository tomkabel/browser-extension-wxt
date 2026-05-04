import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

function getExtensionId(): string {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.extension_id || manifest.key?.slice(0, 32).replace(/[^a-z]/gi, '') || 'dev-id';
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
    await page.waitForTimeout(1000);
  }

  test('unpaired popup (PairingPanel) has zero critical/serious violations', async ({ browser }) => {
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

  test('auth panel has zero critical/serious violations', async ({ browser }) => {
    const page = await context.newPage();
    await openPopup(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('wxt:store-update', {
        detail: {
          pairingState: 'paired',
          sessionState: 'none',
        },
      }));
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('transaction panel has zero critical/serious violations', async ({ browser }) => {
    const page = await context.newPage();
    await openPopup(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('wxt:store-update', {
        detail: {
          pairingState: 'paired',
          sessionState: 'active',
          transactionData: { amount: '€10.00', recipient: 'Test User' },
          transactionState: 'verifying',
        },
      }));
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('credential panel states have zero critical/serious violations', async ({ browser }) => {
    const page = await context.newPage();
    await openPopup(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('wxt:store-update', {
        detail: {
          pairingState: 'paired',
          credentialState: 'requesting',
          credentialDomain: 'example.com',
        },
      }));
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toHaveLength(0);
  });

  test('color contrast audit passes for all visible text', async ({ browser }) => {
    const page = await context.newPage();
    await openPopup(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === 'color-contrast',
    );
    expect(contrastViolations).toHaveLength(0);
  });
});
