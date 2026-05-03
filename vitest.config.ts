import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vite';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig(async () => {
  const wxt = await WxtVitest();
  return {
    plugins: [wxt],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      exclude: ['e2e/**', 'node_modules/**', '.kilocode/**'],
      coverage: {
        provider: 'v8',
        include: [
          'lib/',
          'entrypoints/background/',
          'entrypoints/content/',
          'entrypoints/popup/',
        ],
        exclude: [
          '**/index.ts',
          '**/index.tsx',
          '**/*.d.ts',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/style.css',
        ],
        thresholds: {
          lines: 80,
          branches: 75,
        },
      },
    },
  } satisfies UserConfig;
});
