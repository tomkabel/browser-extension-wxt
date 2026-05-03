## 1. Setup and Dependencies

- [x] 1.1 Install @playwright/test as devDependency (`bun add -d @playwright/test`)
- [x] 1.2 Install Chromium browser binary (`bunx playwright install chromium`)
- [x] 1.3 Install @vitest/coverage-v8 as devDependency (`bun add -d @vitest/coverage-v8`)
- [x] 1.4 Create `e2e/` directory and `e2e/fixtures/` subdirectory

## 2. CI/CD Pipeline

- [x] 2.1 Create `.github/workflows/` directory
- [x] 2.2 Create `.github/workflows/test.yml` with unit-and-integration job (checkout → setup Bun → install → tsc --noEmit → vitest run)
- [x] 2.3 Add e2e job to test.yml (depends on unit-and-integration, runs only on pull_request, installs Playwright Chromium with deps, builds extension, runs playwright test)

## 3. E2E Testing Infrastructure

- [x] 3.1 Create `playwright.config.ts` with Chromium headless project, 30s timeout, CI retries/workers, trace-on-first-retry, webServer pointing to `bun run dev`
- [x] 3.2 Create `e2e/fixtures/test-page.html` with known HTML structure (title, meta description, login form with username/password, analytics script tag)
- [x] 3.3 Create `e2e/popup.spec.ts` — tests for popup render crash detection, domain panel visibility, API health check button interaction
- [x] 3.4 Create `e2e/content-script-flow.spec.ts` — test for full content-script → background → popup messaging round-trip on real domains
- [x] 3.5 Create `e2e/navigation-and-survival.spec.ts` — tests for tab-switch domain update, page reload context invalidation, SPA navigation detection
- [x] 3.6 Create `e2e/page-scraping.spec.ts` — tests for DOM scraping on fixture page (login form detection, meta extraction, script exclusion)

## 4. Test Coverage Instrumentation

- [x] 4.1 Update `vitest.config.ts` to add `test.coverage` block with `provider: 'v8'`
- [x] 4.2 Configure coverage `include` patterns: `lib/`, `entrypoints/background/`, `entrypoints/content/`
- [x] 4.3 Configure coverage `exclude` patterns: entrypoint `index.ts` files and type declarations
- [x] 4.4 Configure coverage `thresholds.lines` to 70 and `thresholds.branches` to 70
- [x] 4.5 Verify `bun run test:coverage` produces a coverage report (script added in step 6.2)

## 5. Missing Unit/Integration Tests

- [x] 5.1 Create `entrypoints/popup/panels/DomainPanel.test.tsx` — tests for loading skeleton, domain data display, empty state ("No domain detected"), error state, and refetch on tab change
- [x] 5.2 Create `entrypoints/popup/panels/ApiPanel.test.tsx` — tests for health indicator rendering, sending state (button disabled, "Sending..."), error display with retry button, success with timestamp, and unhealthy API indicator
- [x] 5.3 Create `entrypoints/content/contentMessageBus.test.ts` — tests for read-dom message routing, unknown type rejection, context invalidation guard (rejection when invalid), valid context acceptance, structured response format (success and error cases)

## 6. Config Alignment

- [x] 6.1 Add scripts to package.json: `test:e2e` (`playwright test`), `test:e2e:ui` (`playwright test --ui`), `test:coverage` (`vitest run --coverage`), `ci:check` (`bun run tsc --noEmit && bun run test && bun run build`)
- [x] 6.2 Verify `bun run ci:check` completes successfully end-to-end
- [x] 6.3 Verify `bun run test` still passes after all changes
