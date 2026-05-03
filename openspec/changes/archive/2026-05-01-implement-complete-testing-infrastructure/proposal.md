## Why

The project has 10 unit/integration test files and a functional vitest.config.ts, but the testing pyramid is incomplete — no CI/CD pipeline, no E2E layer, no coverage tooling, and three source modules have zero coverage. Per AGENTS.md, no test or lint tooling was previously configured, and TESTING_PLAN.md explicitly calls for Playwright E2E tests, a GitHub Actions CI workflow, and coverage targets of 80%/70%/60% across architecture layers. E2E is critical for validating the full content-script → background → popup message chain, DOM scraping on real pages, and extension survival across page reloads — none of which unit or integration tests with fakeBrowser can verify. Without CI, every push is unvalidated; without coverage instrumentation, the team has no visibility into test gaps.

## What Changes

- Install @playwright/test and @vitest/coverage-v8 as devDependencies, and install Chromium browser binary
- Create `playwright.config.ts` with Chromium headless, 30s timeout, CI retries, webServer pointing to `bun run dev`, and trace-on-first-retry
- Create `e2e/` directory with spec files covering popup rendering, full messaging pipeline, navigation/survival, and page scraping with fixture HTML
- Add `test:e2e`, `test:e2e:ui`, `test:coverage`, and `ci:check` scripts to package.json
- Create `e2e/fixtures/test-page.html` with known HTML structure for scraping tests
- Create `.github/workflows/test.yml` with two-job workflow: unit-and-integration (typecheck + vitest) and e2e (build + Playwright, PR-only)
- Update `vitest.config.ts` with coverage configuration: v8 provider, include/exclude patterns, 70% lines/branches thresholds
- Create `entrypoints/popup/panels/DomainPanel.test.tsx` — render states, loading, error, empty, manual refresh
- Create `entrypoints/popup/panels/ApiPanel.test.tsx` — health check button, loading spinner, success/failure display, retry button
- Create `entrypoints/content/contentMessageBus.test.ts` — handler registration, message routing, context invalidation guard, response format validation, unknown type rejection

## Capabilities

### New Capabilities
- `e2e-testing-infrastructure`: Playwright-based E2E test suite with configuration, fixtures, and spec files covering popup rendering, full messaging pipeline, page scraping, and extension lifecycle survival.
- `ci-cd-pipeline`: GitHub Actions workflow that runs type checking, unit/integration tests, and E2E tests (on PRs) on every push to main/develop.
- `test-coverage-reporting`: Vitest configured with @vitest/coverage-v8 to produce coverage reports with branch/line thresholds matching TESTING_PLAN.md targets.
- `panel-component-tests`: React component tests for DomainPanel and ApiPanel covering all render states (loading, error, empty, success).
- `content-message-bus-tests`: Integration tests for contentMessageBus.ts covering message routing, context validation guards, and error handling.

### Modified Capabilities
- `nuxt-package-scripts`: package.json scripts SHALL include test:e2e, test:e2e:ui, test:coverage, and ci:check commands.
- `vitest-configuration`: vitest.config.ts SHALL include coverage provider, include/exclude patterns, and threshold enforcement.

## Impact

- **package.json**: Add @playwright/test, @vitest/coverage-v8 to devDependencies; add test:e2e, test:e2e:ui, test:coverage, ci:check scripts
- **playwright.config.ts**: New file — full Playwright config per TESTING_PLAN.md §6.1
- **e2e/**: New directory with popup.spec.ts, content-script-flow.spec.ts, navigation-and-survival.spec.ts, page-scraping.spec.ts, and fixtures/test-page.html
- **.github/workflows/test.yml**: New file — CI/CD pipeline per TESTING_PLAN.md §7.1
- **vitest.config.ts**: Modified — add coverage configuration with thresholds
- **entrypoints/popup/panels/DomainPanel.test.tsx**: New file — React component tests
- **entrypoints/popup/panels/ApiPanel.test.tsx**: New file — React component tests
- **entrypoints/content/contentMessageBus.test.ts**: New file — integration tests for content script bus
