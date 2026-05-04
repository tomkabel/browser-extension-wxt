import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CI = !!process.env.CI;

const manifestPath = join(process.cwd(), '.output/chrome-mv3/manifest.json');

let extensionPath: string | undefined;
try {
  JSON.parse(readFileSync(manifestPath, 'utf-8'));
  extensionPath = join(process.cwd(), '.output/chrome-mv3');
} catch {
  console.warn(
    'Extension manifest not found at .output/chrome-mv3/. Run `bun run build` before E2E tests.',
  );
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? 'github' : 'list',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    trace: CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            ...(extensionPath
              ? [
                  `--disable-extensions-except=${extensionPath}`,
                  `--load-extension=${extensionPath}`,
                ]
              : []),
          ],
        },
      },
    },
  ],
});
