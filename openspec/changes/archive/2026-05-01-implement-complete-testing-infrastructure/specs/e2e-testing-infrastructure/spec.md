## ADDED Requirements

### Requirement: Playwright is installed and configured

The project SHALL include @playwright/test as a devDependency and have a playwright.config.ts referencing Chromium headless, 30s timeout, CI retries (2 retries), fullyParallel execution, and trace-on-first-retry.

#### Scenario: Playwright devDependency is installed
- **WHEN** `bun install` completes
- **THEN** `@playwright/test` SHALL be available in `node_modules/.bin/playwright`

#### Scenario: Playwright config references Chromium
- **WHEN** `playwright.config.ts` is loaded
- **THEN** it SHALL define a single Chromium project with `--headless=new`, `--disable-gpu`, and `--no-sandbox` launch args

#### Scenario: CI mode enables retries and single worker
- **WHEN** `process.env.CI` is truthy
- **THEN** `retries` SHALL be 2 and `workers` SHALL be 1

### Requirement: E2E spec files exist for key scenarios

The project SHALL have E2E spec files at `e2e/popup.spec.ts`, `e2e/content-script-flow.spec.ts`, `e2e/navigation-and-survival.spec.ts`, and `e2e/page-scraping.spec.ts`.

#### Scenario: Popup E2E tests exist
- **WHEN** `e2e/popup.spec.ts` is executed
- **THEN** it SHALL contain tests for popup render crash detection, domain panel visibility, and API health check button interaction

#### Scenario: Content-script flow E2E tests exist
- **WHEN** `e2e/content-script-flow.spec.ts` is executed
- **THEN** it SHALL contain a test for the full `content-script → background → popup` messaging round-trip on real domains (lhv.ee and youtube.tomabel.ee)

#### Scenario: Navigation and survival E2E tests exist
- **WHEN** `e2e/navigation-and-survival.spec.ts` is executed
- **THEN** it SHALL contain tests for tab-switch domain update flow, page reload context invalidation survival, and SPA navigation detection

#### Scenario: Page scraping E2E tests exist
- **WHEN** `e2e/page-scraping.spec.ts` is executed
- **THEN** it SHALL contain tests for DOM scraping on a fixture page with known HTML structure, including login form detection, meta extraction, and script exclusion

### Requirement: E2E fixture page exists

The project SHALL include `e2e/fixtures/test-page.html` with a known HTML structure used by scraping and content-script E2E tests.

#### Scenario: Fixture page provides test HTML
- **WHEN** `e2e/fixtures/test-page.html` is loaded in a browser
- **THEN** it SHALL contain a page title, a meta description, a login form with username/password inputs, and an analytics script tag

### Requirement: E2E npm scripts are configured

The project SHALL have `test:e2e` and `test:e2e:ui` scripts in package.json.

#### Scenario: test:e2e runs Playwright
- **WHEN** `bun run test:e2e` is executed
- **THEN** Playwright SHALL execute all spec files in the `e2e/` directory

#### Scenario: test:e2e:ui opens Playwright UI mode
- **WHEN** `bun run test:e2e:ui` is executed
- **THEN** Playwright SHALL open its interactive UI for test debugging
