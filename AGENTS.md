# Agent Instructions

This is a WXT-based browser extension (Chrome Manifest V3) using React 19, TypeScript 5.6 (strict), Tailwind CSS 4, and Zustand for state management.

**Project**: SmartID2 — secure transaction verification and credential management.

## Build Commands

- `bun run dev` — Start WXT dev server with HMR
- `bun run build` — Production build (runs `wxt build` + `fix-manifest.js`)
- `bun run preview` — Preview production build
- `bun run test` — Run unit/integration tests once (Vitest)
- `bun run test:watch` — Run tests in watch mode
- `bun run test:e2e` — Run Playwright E2E tests (requires `bun run build` first)
- `bun run test:e2e:ui` — Run E2E tests with Playwright UI
- `bun run test:coverage` — Run tests with coverage report
- `bun run ci:check` — Full CI check (typecheck + test + build)
- `bun run lint` — Run ESLint
- `bun run lint:fix` — Run ESLint with auto-fix
- `bun run format` — Format all files with Prettier
- `bun run format:check` — Check formatting
- `bun run typecheck` — Type-check without emitting
- `bun run prepare` — Install Husky git hooks

This project uses **bun** as its package manager. Always use `bun run` / `bun install` / `bunx` (not npm/pnpm/yarn).

## TypeScript Configuration

- `strict: true` is enabled. Do not loosen strictness.
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`.
- `noImplicitReturns: true` — all code paths in return-typed functions must return.
- Target is `ESNext` with `moduleResolution: "Bundler"`.
- `jsx: "react-jsx"` (React 17+ transform).
- `noEmit: true` — type-check only.
- Path alias `~/` resolves to the project root:
  - Example: `import { log } from '~/lib/errors'`

## Code Style

### Formatting

- Use 2-space indentation.
- Use single quotes for strings.
- Use semicolons.
- Maximum line length: 100 characters.
- Trailing commas in multi-line objects (handled by Prettier).

### Naming

- Components: `PascalCase.tsx`
- Utilities/hooks: `camelCase.ts`
- Entrypoint files: `index.ts` / `index.tsx`
- Classes and interfaces: `PascalCase`
- Functions and variables: `camelCase`
- Module-level constants: `UPPER_SNAKE_CASE`
- Enum names: `PascalCase`; enum members: `PascalCase`
- Message type strings: `kebab-case` (e.g., `'tab-domain-changed'`)

### Imports

- Group imports: external libraries first, then WXT utilities, then internal aliases.
- Use explicit imports; do not rely on WXT auto-imports in source code.
- Prefer named imports over default imports where possible.
- Example WXT imports:
  - `import { defineBackground } from 'wxt/utils/define-background'`
  - `import { browser } from 'wxt/browser'`
  - `import { storage } from 'wxt/utils/storage'`

### Types

- Always annotate public function signatures and exported constants.
- Avoid `any`. Use `unknown` when the type is truly unknown.
- Prefer `interface` over `type` for object shapes that may be extended.
- Use explicit return types on exported functions for clarity.

## Error Handling

- Use the centralized error hierarchy in `lib/errors.ts`:
  - Base: `ExtensionError` (has `code` and `recoverable`)
  - Specialized: `RateLimitError`, `ContextInvalidatedError`, `ApiError`
- Normalize unknown errors with `handleExtensionError()`.
- All async message handlers must return a structured response:
  ```ts
  { success: boolean, data?: unknown, error?: string }
  ```
- Wrap `browser.tabs.sendMessage` calls with a timeout (5s default).
- Check `isContextValid` in content scripts before accessing extension APIs.
- Use `import.meta.env.DEV` to guard development-only logging.

## Project Structure

```
entrypoints/
  auth/           # WebAuthn MFA authentication page
  background/     # Service worker scripts
  content/        # Content scripts injected into pages
  offscreen-webrtc/ # Offscreen document for WebRTC data channel
  popup/          # Extension popup UI (React)
lib/
  channel/        # Noise protocol, QR code, emoji SAS, command client
  crypto/         # WebAuthn PRF/fallback auth crypto
  rateLimit/      # Reusable rate limiter factories
  transaction/    # Transaction detection (bank-specific detectors)
types/            # Shared TypeScript interfaces
e2e/              # Playwright end-to-end tests
  fixtures/       # Static HTML pages for E2E test scenarios
scripts/          # Utility scripts (env validation, ad-hoc testing)
docs/             # Architecture and planning documents
research/         # Research documents (gitignored from Prettier)
signaling-server/ # WebSocket signaling server (deployed separately)
turn-server/      # Coturn TURN server config (deployed separately)
```

## Library Modules (`lib/`)

- **`lib/errors.ts`** — Centralized error hierarchy: `ExtensionError` (base, with `code`/`recoverable`), `RateLimitError`, `ContextInvalidatedError`, `ApiError`. Also provides `handleExtensionError()` for normalizing unknown errors and `log` (info/warn/error/debug) guarded by `import.meta.env.DEV`.
- **`lib/retry.ts`** — `withRetry<T>(fn, options)` with exponential backoff, jitter, and configurable max attempts/delays. Also exports `isRetryableError()` — only retries `AbortError` and 5xx/429 HTTP statuses (never 4xx).
- **`lib/domainParser.ts`** — `parseDomain(url)` returns `DomainParseResult` (discriminated union). Handles multi-level TLDs (co.uk, com.au, etc.), validates protocols, blocks localhost in production, and extracts subdomain/registrable domain.
- **`lib/piiFilter.ts`** — `filterPii(text)` redacts credit cards (with Luhn validation), emails, phones, passwords, and other PII. `filterDomContent()` combines PII filtering with text length truncation.
- **`lib/storage.ts`** — Thin re-export of `wxt/utils/storage`.
- **`lib/store.ts`** — Zustand store (`useAppStore`) managing `currentTab`, `apiHealthy`, `apiStatus`, `apiError`, `lastSent`.
- **`lib/rateLimit/slidingWindow.ts`** — `createSlidingWindowLimiter()` and `createDomainRateLimiter()` for reusable rate limiting.
- **`lib/replayProtection.ts`** — `isReplayAssertion()` / `recordAssertion()` for WebAuthn assertion replay prevention.
- **`lib/asyncUtils.ts`** — `withTimeout<T>()` for adding timeouts to promises.
- **`lib/domainParser.test.ts`**, **`lib/errors.test.ts`**, etc. — Unit tests are co-located with source files, named `*.test.ts` or `*.test.tsx`.

## Messaging

### Message Protocol

All messages use the shape defined in `types/index.ts`:

```ts
interface ExtensionMessage<T = unknown> {
  type: MessageType;      // 'tab-domain-changed' | 'get-current-domain' | 'send-to-api' | 'check-api-health' | 'read-dom'
  payload: T;
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### Background Handlers (`entrypoints/background/messageHandlers.ts`)

- Centralized handler registry: `handlers` record keyed by `MessageType`.
- `registerMessageHandlers()` validates message format, dispatches to the matching handler, and always returns `true` (async).
- Tab ID resolution: prefer `sender.tab?.id` (from content scripts); fallback to `browser.tabs.query({ active: true, currentWindow: true })` for popup messages where `sender.tab` may be missing.
- All handlers return `{ success, data?, error? }`.

### Content Script Message Bus (`entrypoints/content/contentMessageBus.ts`)

- `registerContentHandlers()` routes `browser.runtime.onMessage` by `message.type`.
- Returns `true` for all async handlers (required by Chrome for `sendResponse`).
- Checks `isContextValid` before processing; returns error response on invalid context.

## Content Script Patterns

- **Lifecycle**: Use `ctx.addEventListener(window, 'wxt:locationchange', ...)` for SPA navigation detection. Use `ctx.onInvalidated()` for cleanup on context invalidation.
- **Rate Limiting**: `entrypoints/content/rateLimiter.ts` — exported `checkRateLimit()`, `startCleanupInterval()`, `stopCleanupInterval()`. Content script starts the cleanup interval in `main()` and stops it on invalidation.
- **URL access**: Content scripts use `document.location.href` directly — do NOT use `browser.tabs.query` (requires extra permissions and adds race conditions).
- **Entry definition**: Content scripts are defined with `defineContentScript({ matches, runAt, main(ctx) })`.

## Popup Component Patterns

- **Code splitting**: Use `React.lazy()` + `Suspense` for each panel component (AuthPanel, TransactionPanel, CredentialPanel, PairingPanel) loaded from `entrypoints/popup/panels/`.
- **Tab lifecycle**: Panels subscribe to `browser.tabs.onActivated` / `browser.tabs.onUpdated` to refetch data when the active tab changes.
- **Cleanup**: Always use a `mounted` flag in `useEffect` to prevent state updates after unmount. Always remove listeners in the effect cleanup function.
- **Messaging**: Popup communicates with the background script via `browser.runtime.sendMessage({ type, payload })`.

## Testing

### Unit & Integration Tests (Vitest)

- **Runner**: Vitest with `jsdom` environment and `WxtVitest` plugin.
- **Setup**: `vitest.setup.ts` imports `@testing-library/jest-dom`, resets `fakeBrowser` before each test, and mocks `global.fetch`.
- **WXT mocking**: Use `fakeBrowser` from `wxt/testing` for browser API mocking. Call `fakeBrowser.reset()` in `beforeEach`.
- **File naming**: Test files are co-located with source: `*.test.ts` / `*.test.tsx` for unit/integration tests.
- **Coverage**: v8 provider with thresholds: lines ≥ 80%, branches ≥ 75%. Coverage targets `lib/`, `entrypoints/background/`, `entrypoints/content/`, `entrypoints/popup/`. Index files, test files, and style files are excluded.
- **E2E exclusion**: Vitest config excludes `e2e/**` so E2E specs are not picked up by the unit test runner.

### E2E Tests (Playwright)

- **Location**: `e2e/` directory. Test fixtures at `e2e/fixtures/`.
- **Config**: `playwright.config.ts` — Chromium headless, CI-aware (retries, parallel workers, GitHub reporter). Extension loaded via `--load-extension` flag.
- **Prerequisite**: E2E tests require `bun run build` first (extension must exist at `.output/chrome-mv3/`).
- **Extension ID**: Resolved from `.output/chrome-mv3/manifest.json` at runtime.
- **Pattern**: `test.beforeAll` creates a browser context and page. `test.afterAll` closes the context. Tests skip gracefully if extension is not built.

## CI/CD

- **GitHub Actions**: `.github/workflows/test.yml`
  - **unit-and-integration job**: Runs on push to `main`/`develop` and all PRs to `main`. Steps: checkout → setup-bun → install → typecheck → vitest.
  - **e2e job**: Runs only on PRs (not push), after unit tests pass. Steps: checkout → setup-bun → install → playwright install chromium → build extension → playwright test.
- **Pre-commit hooks**: Husky runs `lint-staged` on commit. `lint-staged` auto-fixes ESLint and Prettier on `*.{ts,tsx,js,jsx}`, and Prettier on `*.{css,json,md}`.

## Tooling Notes

- `.wxt/eslint-auto-imports.mjs` — Auto-generated file that registers WXT globals (`browser`, `storage`, `defineContentScript`, etc.) with ESLint to prevent false "not defined" warnings.
- `.prettierignore` — Excludes build artifacts, coverage, `.kilocode/`, `research/`, `openspec/`, `bun.lock`, and `*.md` files from formatting.
- `fix-manifest.js` — Post-build script that runs after `wxt build`. Adjusts the generated manifest for production requirements.

## State Management

- Use Zustand for global app state (`lib/store.ts`).
- Keep stores small and focused. Split stores by domain if needed.
- Prefer `useAppStore` over prop drilling or context for shared state.
- Stores can be accessed outside React (useful in background scripts).

## Linting & Formatting

- ESLint flat config (`eslint.config.js`) with typescript-eslint and react-hooks plugin.
- Prettier for formatting (`.prettierrc`).
- Pre-commit hooks via Husky + lint-staged (see `package.json#lint-staged`).
- Run `bun run lint` before committing; `bun run format` for bulk formatting.

## WXT Patterns

- Define entrypoints with `defineBackground()`, `defineContentScript()`, or `definePopup()`.
- Use `browser.runtime.sendMessage` / `browser.tabs.sendMessage` for cross-context messaging.
- Prefer `storage` utility over raw `chrome.storage` API.
- Keep content scripts lightweight; offload heavy work to the background script.

## Styling

- Use Tailwind CSS v4 utility classes in popup and UI components.
- Tailwind v4 uses `@import "tailwindcss"` in CSS files (no `@tailwind` directives).
- CSS-first configuration via `@theme` blocks in CSS (no `tailwind.config.js`).
- Vite-native integration via `@tailwindcss/vite` plugin (no PostCSS needed).
- Import `~/entrypoints/popup/style.css` in popup entrypoints.
- Do not use inline styles except for dynamic values that Tailwind cannot express.

## Security

- Do not log or expose API keys, secrets, or user data.
- Validate all messages received via `runtime.onMessage`.
- Use the extension's Content Security Policy as defined in `wxt.config.ts`.
