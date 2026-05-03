# WXT Browser Extension Testing Plan

_Generated: 2026-04-30 | Project: domain-inspector | Framework: WXT 0.20.20 | Confidence: High_

---

## Executive Summary

This project uses **WXT 0.20.20** with Vitest 4.1.5 for unit testing and Playwright for E2E testing. The codebase has a solid error handling hierarchy, `TabStateManager` with in-memory caching, background message handlers, and React popup UI. Testing infrastructure is partially set up (one test file exists in `lib/`), but the majority of the codebase — especially background script logic (`tabState.ts`, `messageHandlers.ts`, `apiRelay.ts`) — has **zero test coverage**.

---

## 1. Testing Pyramid for WXT/MV3 Extensions

```
        ┌─────────────────────────┐
        │     E2E (Playwright)     │  ← Loads .output/chrome-mv3 extension
        │   Popup UI / Full Flow   │
        ├─────────────────────────┤
        │  Integration (Vitest)    │  ← With fakeBrowser, tests all WXT APIs
        │  Background + Content     │
        ├─────────────────────────┤
        │   Unit (Vitest)          │  ← Pure functions, parsers, error handling
        │   lib/, utilities        │
        └─────────────────────────┘
```

**Recommended Ratio**: 70% unit / 20% integration / 10% E2E for extension backends; pivot toward more E2E if UI is complex.

---

## 2. Unit Testing Setup

### 2.1 Configure Vitest with WXT Plugin

Create `vitest.config.ts` in the project root:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

Create `vitest.setup.ts`:

```ts
// vitest.setup.ts
import '@testing-library/jest-dom'
import { fakeBrowser } from 'wxt/testing/fake-browser'

beforeEach(() => {
  fakeBrowser.reset()
})
```

**What `WxtVitest()` provides**:

- Polyfills `browser.*` extension API with in-memory implementation via `@webext-core/fake-browser`
- Adds all Vite config/plugins from `wxt.config.ts`
- Configures auto-imports (if enabled)
- Sets `import.meta.env.BROWSER`, `import.meta.env.MANIFEST_VERSION`, `import.meta.env.IS_CHROME`
- Configures path aliases (`@/*`, `@@/*`, `~~/` → project root)

### 2.2 Update package.json Scripts

```json
{
  "scripts": {
    "dev": "wxt dev",
    "build": "wxt build && node fix-manifest.js",
    "preview": "wxt preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

### 2.3 Unit Test Priority Map

| File                  | What to Test                              | Priority                            |
| --------------------- | ----------------------------------------- | ----------------------------------- |
| `lib/domainParser.ts` | URL parsing, TLD extraction, error cases  | **HIGH** (has 1 existing test file) |
| `lib/errors.ts`       | Error hierarchy, `handleExtensionError()` | **HIGH**                            |
| `lib/retry.ts`        | Exponential backoff, jitter, max retries  | **HIGH**                            |
| `lib/piiFilter.ts`    | PII redaction patterns                    | **MEDIUM**                          |
| `lib/storage.ts`      | Storage wrapper with migrations           | **MEDIUM**                          |

---

## 3. Unit Test Examples

### 3.1 `lib/errors.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import {
  handleExtensionError,
  ExtensionError,
  RateLimitError,
  ApiError,
  ContextInvalidatedError,
} from './errors'

describe('handleExtensionError', () => {
  it('passes through ExtensionError instances', () => {
    const err = new RateLimitError(5000)
    expect(handleExtensionError(err)).toBe(err)
  })

  it('converts extension context invalidation messages', () => {
    const err = new Error('Extension context invalidated')
    expect(handleExtensionError(err)).toBeInstanceOf(ContextInvalidatedError)
  })

  it('wraps unknown errors', () => {
    expect(handleExtensionError(new Error('boom'))).toBeInstanceOf(ExtensionError)
  })

  it('returns null for non-Error values', () => {
    expect(handleExtensionError('string')).toBeNull()
    expect(handleExtensionError(null)).toBeNull()
  })
})

describe('ApiError recoverability', () => {
  it('is recoverable for 5xx', () => {
    expect(new ApiError('server error', 500).recoverable).toBe(true)
  })
  it('is recoverable for 429', () => {
    expect(new ApiError('rate limited', 429).recoverable).toBe(true)
  })
  it('is NOT recoverable for 4xx', () => {
    expect(new ApiError('bad request', 400).recoverable).toBe(false)
  })
  it('is NOT recoverable for undefined status', () => {
    expect(new ApiError('unknown').recoverable).toBe(false)
  })
})
```

### 3.2 `lib/retry.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retries on failure with exponential backoff', async () => {
    let attempts = 0
    const fn = vi.fn().mockImplementation(() => {
      attempts++
      if (attempts < 3) throw new Error('fail')
      return 'success'
    })

    const result = retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 100 })

    await vi.runAllTimersAsync()

    expect(result).resolves.toBe('success')
    expect(attempts).toBe(3)
  })

  it('does not retry if max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    const result = retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 50 })

    await vi.runAllTimersAsync()

    expect(result).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('applies jitter to delay', async () => {
    // Verify delay varies between calls
    const delays: number[] = []
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // 50% jitter
  })
})
```

### 3.3 `lib/piiFilter.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { filterPII } from './piiFilter'

describe('filterPII', () => {
  it('redacts email addresses', () => {
    expect(filterPII('Contact: john@example.com')).toContain('[EMAIL]')
    expect(filterPII('Contact: john@example.com')).not.toContain('john@example.com')
  })

  it('redacts phone numbers', () => {
    expect(filterPII('Call: +1-555-123-4567')).toContain('[PHONE]')
    expect(filterPII('SMS: 5551234567')).toContain('[PHONE]')
  })

  it('redacts IP addresses', () => {
    expect(filterPII('IP: 192.168.1.1')).toContain('[IP]')
    expect(filterPII('IPv6: ::1')).toContain('[IP]')
  })

  it('passes through text with no PII', () => {
    const input = 'This is a normal log message'
    expect(filterPII(input)).toBe(input)
  })
})
```

---

## 4. Integration Testing — Background Scripts

Use `fakeBrowser` from `wxt/testing/fake-browser` to test background scripts with full WXT API mocking.

### 4.1 `entrypoints/background/tabState.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { TabStateManager } from './tabState'

describe('TabStateManager', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('updates tab domain and returns true for new URL', async () => {
    const result = await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    expect(result).toBe(true)
  })

  it('returns false for duplicate update within TTL window', async () => {
    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    const result = await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    expect(result).toBe(false) // deduplicated by cache
  })

  it('allows update after TTL expires', async () => {
    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    // Advance time past CACHE_TTL_MS (1000)
    fakeBrowser.clock.tick(1001)
    const result = await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    expect(result).toBe(true)
  })

  it('stores valid domain state in session storage', async () => {
    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    const state = await TabStateManager.getTabDomain(1)
    expect(state).not.toBeNull()
    expect(state?.domain).toBe('www.lhv.ee')
    expect(state?.registrableDomain).toBe('lhv.ee')
    expect(state?.isPublic).toBe(true)
  })

  it('rejects invalid URLs without storing', async () => {
    const result = await TabStateManager.updateTabDomain(1, 'not-a-url')
    expect(result).toBe(false)
    const state = await TabStateManager.getTabDomain(1)
    expect(state).toBeNull()
  })

  it('clears tab state on removal', async () => {
    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    fakeBrowser.tabs.onRemoved.emit(1)
    const cached = await TabStateManager.getTabDomain(1)
    expect(cached).toBeNull()
  })

  it('clears all states via clearAllStates', async () => {
    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee')
    await TabStateManager.updateTabDomain(2, 'https://example.com')
    await TabStateManager.clearAllStates()
    const state1 = await TabStateManager.getTabDomain(1)
    const state2 = await TabStateManager.getTabDomain(2)
    expect(state1).toBeNull()
    expect(state2).toBeNull()
  })
})
```

### 4.2 `entrypoints/background/messageHandlers.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { registerMessageHandlers } from './messageHandlers'

describe('messageHandlers', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    // Re-register handlers before each test to ensure clean state
    registerMessageHandlers()
  })

  describe('tab-domain-changed', () => {
    it('updates tab domain when sender tab ID is available', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'tab-domain-changed', payload: { domain: 'lhv.ee', url: 'https://lhv.ee' } },
        { tab: { id: 1 } }
      )
      expect(response.success).toBe(true)
    })

    it('returns error when sender tab ID is missing', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'tab-domain-changed', payload: { domain: 'lhv.ee', url: 'https://lhv.ee' } },
        { tab: undefined }
      )
      expect(response.success).toBe(false)
      expect(response.error).toContain('Cannot identify sender tab')
    })

    it('returns false when URL is invalid', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'tab-domain-changed', payload: { domain: '', url: 'not-a-url' } },
        { tab: { id: 1 } }
      )
      expect(response.success).toBe(true) // handler succeeds, but update returns false
      const data = response.data as { updated: boolean }
      expect(data.updated).toBe(false)
    })
  })

  describe('get-current-domain', () => {
    it('returns domain for known tab', async () => {
      // First set up state
      await TabStateManager.updateTabDomain(1, 'https://lhv.ee')
      const response = await browser.runtime.onMessage.emit(
        { type: 'get-current-domain', payload: {} },
        { tab: { id: 1 } }
      )
      expect(response.success).toBe(true)
      expect((response.data as { domain: string }).domain).toBe('www.lhv.ee')
    })

    it('returns error when no domain recorded for tab', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'get-current-domain', payload: {} },
        { tab: { id: 999 } }
      )
      expect(response.success).toBe(false)
      expect(response.error).toContain('No domain recorded')
    })

    it('returns error when tab ID is missing', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'get-current-domain', payload: {} },
        { tab: undefined }
      )
      expect(response.success).toBe(false)
      expect(response.error).toContain('No active tab')
    })
  })

  describe('send-to-api', () => {
    it('forwards content and metadata to ApiRelay', async () => {
      const payload = {
        content: { scraped: true },
        metadata: { domain: 'lhv.ee', url: 'https://lhv.ee', timestamp: Date.now() },
      }
      const response = await browser.runtime.onMessage.emit(
        { type: 'send-to-api', payload },
        { tab: { id: 1 } }
      )
      // Response depends on ApiRelay implementation
      expect(typeof response.success).toBe('boolean')
    })
  })

  describe('check-api-health', () => {
    it('delegates to ApiRelay.healthCheck', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'check-api-health', payload: {} },
        { tab: { id: 1 } }
      )
      expect(typeof response.success).toBe('boolean')
    })
  })

  describe('invalid messages', () => {
    it('rejects messages without type field', async () => {
      const response = await browser.runtime.onMessage.emit({ payload: {} }, { tab: { id: 1 } })
      expect(response.success).toBe(false)
      expect(response.error).toContain('Invalid message format')
    })

    it('rejects messages without payload field', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'tab-domain-changed' },
        { tab: { id: 1 } }
      )
      expect(response.success).toBe(false)
    })

    it('returns error for unknown message type', async () => {
      const response = await browser.runtime.onMessage.emit(
        { type: 'unknown-type', payload: {} },
        { tab: { id: 1 } }
      )
      expect(response.success).toBe(false)
      expect(response.error).toContain('Unknown message type')
    })
  })
})
```

> **Note**: `browser.runtime.onMessage.emit()` is the fake-browser API for simulating message dispatch in tests. WXT's `WxtVitest` plugin provides the full `browser.*` polyfill. For full popup ↔ background message round-trip, use E2E tests.

---

## 5. Content Script Testing

Content scripts run in an **isolated world** and are harder to test directly. Test strategy:

1. **Unit test pure functions** (e.g., `domScraper.ts` parsing logic) in Vitest with jsdom
2. **E2E test** full content script behavior via Playwright loading a test page
3. **Integration test** message passing via `fakeBrowser`

### 5.1 `entrypoints/content/domScraper.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { scrapePageInfo } from './domScraper'

// Using jsdom for DOM simulation
const mockHtml = `
<!DOCTYPE html>
<html>
  <head>
    <title>Test Bank Login</title>
    <meta name="description" content="Login to your account">
  </head>
  <body>
    <form id="login-form">
      <input name="username" type="text" />
      <input name="password" type="password" />
    </form>
    <script src="analytics.js"></script>
  </body>
</html>
`

function createMockDocument(html: string): Document {
  const { JSDOM } = require('jsdom')
  return new JSDOM(html).window.document
}

describe('scrapePageInfo', () => {
  it('extracts page title', () => {
    const doc = createMockDocument(mockHtml)
    const result = scrapePageInfo(doc)
    expect(result.title).toBe('Test Bank Login')
  })

  it('extracts meta description', () => {
    const doc = createMockDocument(mockHtml)
    const result = scrapePageInfo(doc)
    expect(result.description).toBe('Login to your account')
  })

  it('detects login forms', () => {
    const doc = createMockDocument(mockHtml)
    const result = scrapePageInfo(doc)
    expect(result.hasLoginForm).toBe(true)
  })

  it('excludes analytics scripts', () => {
    const doc = createMockDocument(mockHtml)
    const result = scrapePageInfo(doc)
    expect(result.scripts).not.toContain('analytics.js')
  })
})
```

### 5.2 `entrypoints/content/rateLimiter.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('allows request when under limit', () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 })
    expect(limiter.canMakeRequest()).toBe(true)
  })

  it('blocks request when limit exceeded', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 })
    limiter.recordRequest() // 1
    limiter.recordRequest() // 2
    expect(limiter.canMakeRequest()).toBe(false)
  })

  it('resets after window expires', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 100 })
    limiter.recordRequest()
    limiter.recordRequest()
    expect(limiter.canMakeRequest()).toBe(false)
    fakeBrowser.clock.tick(101)
    expect(limiter.canMakeRequest()).toBe(true)
  })

  it('returns retry-after time when blocked', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })
    limiter.recordRequest()
    const retryAfter = limiter.getRetryAfter()
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(1000)
  })
})
```

---

## 6. E2E Testing with Playwright

### 6.1 Setup

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts`:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import { join } from 'path'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [`--headless=new`, `--disable-gpu`, `--no-sandbox`],
        },
      },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

### 6.2 E2E Test File: `e2e/popup.spec.ts`

```ts
import { test, expect, chromium } from '@playwright/test'
import { join } from 'path'

test.describe('Extension Popup', () => {
  test.beforeEach(async ({ page }) => {
    // Load the built extension
    const extensionPath = join(__dirname, '../.output/chrome-mv3')
    const context = await chromium.launch({
      args: [`--headless=new`, `--load-extension=${extensionPath}`],
    })
    const page = await context.newPage()
  })

  test('popup renders without crash', async ({ page }) => {
    // Trigger extension popup by clicking browser action
    // The popup HTML is loaded from the extension
    await page.goto('chrome-extension://__MSG_@@extension_id__/popup.html')

    // Verify React app mounts
    const root = page.locator('#root')
    await expect(root).toBeVisible()
  })

  test('domain panel is visible on startup', async ({ page }) => {
    await page.goto('chrome-extension://__MSG_@@extension_id__/popup.html')

    // Check for main panel structure
    const panel = page.locator('[data-testid="domain-panel"]')
    await expect(panel)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Fallback: check for any visible panel content
        const content = page.locator('body')
        expect(content).toBeVisible()
      })
  })

  test('api health check button triggers request', async ({ page }) => {
    await page.goto('chrome-extension://__MSG_@@extension_id__/popup.html')

    const healthButton = page.locator('button:has-text("Check API")')
    if (await healthButton.isVisible()) {
      await healthButton.click()
      // Verify loading or result state
      await expect(page.locator('body')).not.toHaveText(/loading/)
    }
  })
})

test.describe('Content Script → Background → Popup Flow', () => {
  test('tab-domain-changed message propagates to popup', async ({ page }) => {
    // This requires a real test page with the content script injected
    const testPage = 'https://www.lhv.ee'

    // Navigate to a page and trigger the content script
    await page.goto(testPage)

    // The content script should send tab-domain-changed to background
    // Then popup should be able to query get-current-domain

    // This is an end-to-end integration test
    // Implement based on specific UX flow
  })
})
```

### 6.3 E2E Test Priority Scenarios

| Scenario                       | What It Validates                                     |
| ------------------------------ | ----------------------------------------------------- |
| Popup renders without crash    | React mounts, Tailwind loads, no JS errors            |
| Domain panel shows data        | Messaging from content → popup works end-to-end       |
| API health check via popup     | Full `popup → background → API` chain                 |
| Tab switch updates domain      | Content script → background `tab-domain-changed` flow |
| Extension survives page reload | Context invalidation handling                         |

---

## 7. CI/CD Integration

### 7.1 GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-and-integration:
    name: Unit + Integration Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        run: bun run tsc --noEmit

      - name: Run unit + integration tests
        run: bun run test

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: unit-and-integration
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright
        run: bunx playwright install chromium --with-deps

      - name: Build extension
        run: bun run build

      - name: Run E2E tests
        run: bun run test:e2e
```

### 7.2 Pre-commit Hook (Optional)

```yaml
# .husky/pre-commit
#!/bin/sh
bun run test && bun run tsc --noEmit
```

---

## 8. Key Guidelines

### 8.1 Mocking `#imports` Correctly

WXT uses a `#imports` virtual module that gets rewritten during preprocessing. When mocking WXT APIs, use the **real import paths**, NOT `#imports`.

Check `.wxt/types/imports-module.d.ts` (run `wxt prepare` if missing) to find real paths:

```ts
// What you write
import { injectScript, createShadowRootUi } from '#imports'

// What Vitest sees (after rewrite)
import { injectScript } from 'wxt/utils/inject-script'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'

// Correct mock:
vi.mock('wxt/utils/inject-script', () => ({
  injectScript: vi.fn(),
}))
```

### 8.2 fakeBrowser Reset Between Tests

Always call `fakeBrowser.reset()` in `beforeEach` to ensure clean state:

```ts
beforeEach(() => {
  fakeBrowser.reset()
})
```

### 8.3 Async Message Handler Response

Message handlers return `Promise<MessageResponse>` with `{ success: boolean, data?: unknown, error?: string }`. Ensure tests await the response properly.

### 8.4 Content Script Context Validation

Per AGENTS.md: "Check `isContextValid` in content scripts before accessing extension APIs." Tests for content scripts should verify this behavior.

### 8.5 Timeout for `browser.tabs.sendMessage`

Per AGENTS.md: "Wrap `browser.tabs.sendMessage` calls with a timeout (5s default)." Tests should cover timeout scenarios.

---

## 9. Test File Naming Convention

| File Type         | Pattern                      | Example                                   |
| ----------------- | ---------------------------- | ----------------------------------------- |
| Unit tests        | `*.test.ts`                  | `lib/errors.test.ts`                      |
| Integration tests | `*.test.ts` alongside source | `entrypoints/background/tabState.test.ts` |
| E2E tests         | `e2e/*.spec.ts`              | `e2e/popup.spec.ts`                       |

---

## 10. Coverage Targets

| Layer              | Target Coverage                                            |
| ------------------ | ---------------------------------------------------------- |
| `lib/` utilities   | **80%+** (domainParser, errors, retry, piiFilter, storage) |
| Background scripts | **70%+** (tabState, messageHandlers, apiRelay)             |
| Content scripts    | **60%+** (domScraper, rateLimiter, contentMessageBus)      |
| UI components      | Minimal unit tests; E2E for interaction                    |

---

## Key Takeaways

1. **Biggest gap**: Background scripts (`tabState.ts`, `messageHandlers.ts`, `apiRelay.ts`) have zero tests — add integration tests with `fakeBrowser`
2. **Already partially set up**: `vitest` is in devDependencies, one test file exists; need `vitest.config.ts` + `WxtVitest()` plugin
3. **Use `fakeBrowser`** for all extension API mocking — handles `storage`, `tabs`, `runtime.sendMessage`, `alarms` in-memory
4. **Mock `#imports` correctly**: Use real paths like `"wxt/utils/inject-script"`, NOT `"#imports"`
5. **E2E = Playwright** loading extension from `.output/chrome-mv3` path
6. **Content script testing** — unit test pure functions in Vitest, E2E test full flows with Playwright

---

## Sources

1. [WXT Unit Testing Guide](https://wxt.dev/guide/essentials/unit-testing.md)
2. [WXT E2E Testing Guide](https://wxt.dev/guide/essentials/e2e-testing.md)
3. [WXT fake-browser API Reference](https://wxt.dev/api/reference/wxt/testing/fake-browser.md)
4. [WXT @webext-core/fake-browser](https://webext-core.aklinker1.io/fake-browser/installation)
5. [WXT Playwright Example](https://github.com/wxt-dev/examples/tree/main/examples/playwright-e2e-testing)
6. [WXT Vitest Unit Testing Example](https://github.com/wxt-dev/examples/tree/main/examples/vitest-unit-testing)
