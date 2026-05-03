## Context

The project (domain-inspector, a WXT 0.20.20 browser extension) has 10 unit/integration test files using Vitest 4.1.5 with WxtVitest plugin and fakeBrowser. The existing tests cover lib/ utilities (domainParser, errors, retry, piiFilter), background scripts (tabState, messageHandlers, apiRelay), content scripts (domScraper, rateLimiter), and one popup panel (ContentPanel). However, three source modules have zero test coverage (DomainPanel, ApiPanel, contentMessageBus), there is no CI/CD pipeline, no E2E testing layer, and no coverage instrumentation. TESTING_PLAN.md defines the target architecture including Playwright E2E, GitHub Actions CI, and coverage thresholds.

## Goals / Non-Goals

**Goals:**
- Add Playwright E2E tests that validate the full extension lifecycle on real pages, including the content-script → background → popup messaging chain, DOM scraping, and extension survival across navigation/reload
- Create a GitHub Actions CI workflow that runs typecheck → unit/integration tests → E2E tests (PR-only) on every push
- Configure coverage instrumentation via @vitest/coverage-v8 with threshold enforcement matching TESTING_PLAN.md targets
- Fill test gaps: React component tests for DomainPanel and ApiPanel, integration tests for contentMessageBus

**Non-Goals:**
- Refactoring existing source code — all new work is additive (tests, configs, CI)
- Adding linting or pre-commit hooks (TESTING_PLAN.md §7.2 marks husky as optional)
- Changing the test framework or migrating from Vitest
- Adding Safari/Firefox E2E projects (Chromium-only, following TESTING_PLAN.md §6.1)
- Adding more background or lib tests (those already have coverage)

## Decisions

### Decision 1: Playwright over Puppeteer for E2E

**Rationale:** WXT's official E2E documentation recommends Playwright with examples at `wxt-dev/examples/playwright-e2e-testing`. Playwright supports extension loading via `--load-extension`, multi-tab scenarios needed for tab-switch tests, and has better trace/debug tooling (trace-on-first-retry). Puppeteer lacks built-in extension loading support.

**Alternatives considered:** Puppeteer — rejected because it requires manual extension loading via `--disable-extensions-except` and lacks Playwright's tracing/reporting.

### Decision 2: Separate CI jobs for unit/integration and E2E

**Rationale:** E2E tests are slow (extension build + Chromium install + real page navigation) and flaky by nature. Running them in a separate job with `needs: unit-and-integration` means fast feedback on typecheck/unit failures without waiting for E2E. E2E runs only on PRs (not every push) to conserve CI minutes.

**Alternatives considered:** Single monolithic job — rejected because E2E failures shouldn't block viewing unit test results, and vice versa.

### Decision 3: @vitest/coverage-v8 over istanbul (c8)

**Rationale:** Vitest 4.x has deprecated c8 in favor of v8. The `@vitest/coverage-v8` package uses V8's native coverage which is faster and more accurate for TypeScript projects than istanbul-based instrumentation.

**Alternatives considered:** @vitest/coverage-istanbul (c8) — deprecated in Vitest 4.x.

### Decision 4: Keep jsdom environment, not switch to happy-dom

**Rationale:** While TESTING_PLAN.md §2.1 recommends happy-dom, the project already uses jsdom in `vitest.config.ts` with working DOM tests (ContentPanel.test.tsx, domScraper.test.ts). Switching to happy-dom would be a breaking change for existing JSDOM-dependent domScraper tests. The AGENTS.md says "do not loosen strictness" — changing the test environment without a clear bug is unnecessary risk.

### Decision 5: Four E2E spec files organized by concern

**Rationale:** Separating popup, content-script flow, navigation, and scraping into distinct spec files allows parallel execution (`fullyParallel: true` in Playwright config) and makes it clear which area a failure belongs to. The fixture page (`e2e/fixtures/test-page.html`) is shared by scraping and content-script tests.

### Decision 6: Coverage thresholds at 70% lines/branches (aggregated)

**Rationale:** TESTING_PLAN.md §10 defines per-layer targets (80% lib, 70% background, 60% content), but `@vitest/coverage-v8` thresholds apply globally. Setting 70% lines/branches is a reasonable aggregate that doesn't block unrelated PRs while forcing attention on uncovered modules. Per-layer targets will be tracked via the coverage report, not CI thresholds.

## Risks / Trade-offs

- **[Risk] E2E tests are slow (~2-5 min) and may be flaky on CI** → Mitigation: E2E job runs only on PRs, uses 2 retries in CI, and is independent from unit/integration pass/fail. Traces are captured on first retry for debugging.
- **[Risk] Playwright Chromium binary adds ~300MB to CI cache** → Mitigation: Use `oven-sh/setup-bun@v2` caching and Playwright's built-in browser caching; CI minutes are acceptable for PR-only jobs.
- **[Risk] Extension ID changes on each build, breaking E2E popup URL** → Mitigation: Read extension ID dynamically from `.output/chrome-mv3/manifest.json` in test setup, or use Playwright's `persistentContext` with explicit extension path loading.
- **[Trade-off] Coverage thresholds may block merges for unrelated changes** → Mitigation: Thresholds set at 70% (below current covered proportion) and can be raised incrementally as coverage improves.

## Open Questions

- Should E2E tests also run on `develop` branch pushes (not just PRs)? TESTING_PLAN.md §7.1 specifies `push: [main, develop]` but E2E is currently PR-only.
- What real domains should E2E tests use? The proposal specifies `lhv.ee` and `youtube.tomabel.ee` — are these always reachable from CI?
- Should the `ci:check` script include `bun run build` or just typecheck + test? A full build is slow for local dev iteration.
