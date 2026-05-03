# Rewrite E2E Tests for Extension-Context Verification

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

All five E2E test files in `e2e/` share a critical structural flaw: they create a plain `browser.newContext()` without loading the extension. The tests navigate to web pages and verify DOM content (page title, heading text, link counts) but never interact with the extension's popup, content scripts, or background service worker. The `getExtensionId()` helper reads the manifest but no test uses the extension ID to open a popup or access extension pages.

Specific issues:
- `content-script-flow.spec.ts` — Navigates to lhv.ee and checks the page title contains "lhv". Does NOT verify any extension message was sent.
- `integration-flow.spec.ts` — Checks page titles and URLs. The "auth page is accessible" test wraps the call in try/catch and skips on failure, hiding real errors.
- `navigation-and-survival.spec.ts` — Opens two pages and switches tabs. Does not verify extension state or content script survival.
- `popup.spec.ts` — Never opens the extension popup. Checks `example.com` DOM.
- `page-scraping.spec.ts` — Tests `test-page.html` fixture directly. Does not test the extension's `scrapePage()` function.

### Solution

1. Load the extension in all test suites using `browser.newContext()` with `chromium.launchPersistentContext` and the extension path set:
   ```ts
   const context = await browser.newContext({
     ...devices['Desktop Chrome'],
     args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
   });
   ```
2. Replace content-checks with extension-specific assertions:
   - Open `chrome-extension://<id>/popup.html` and inspect panel rendering.
   - Use `page.evaluate()` to inject code and verify content script behavior.
   - Listen for `browser.runtime.onMessage` via `page.addInitScript` to capture extension messages.
3. Remove try/catch skips that mask failures; use `test.skip` only for the pre-build check.
4. Add a dedicated test that sends a `browser.runtime.sendMessage` from the test page and verifies the background handler responds.

### Acceptance Criteria

- At least 3 E2E tests verify extension-specific behavior (message round-trip, popup rendering, content script scraping).
- All tests consistently pass (no flaky page-title checks).
- The extension ID is resolved from the manifest and used to access extension pages.
- CI pipeline runs the rewritten E2E suite against the built extension.
