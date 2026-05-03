# Agent Instructions

This is a WXT-based Chrome MV3 browser extension using React 19, TypeScript 5.6 (strict), Tailwind CSS 4, and Zustand.

**Project**: SmartID2 — secure transaction verification and credential management via phone-as-vault.

## Build & Developer Commands

- `bun run dev` — Start WXT dev server with HMR
- `bun run build` — Prebuild validates env vars, then `wxt build`, then `fix-manifest.js`
- `bun run test` — Unit/integration tests (Vitest)
- `bun run test:e2e` — Playwright E2E (requires `bun run build` first; extension must exist at `.output/chrome-mv3/`)
- `bun run typecheck` — `tsc --noEmit`
- `bun run ci:check` — Full CI: typecheck → test → build
- `bun run lint` / `bun run format` — ESLint / Prettier

**Package manager**: bun (not npm/pnpm/yarn).

**Env vars**: Build fails if `VITE_API_ENDPOINT` or `VITE_SIGNALING_URL` are missing (see `scripts/validate-env.ts`, `.env.example`).

## TypeScript

- Path alias `~/` resolves to project root. Example: `import { log } from '~/lib/errors'`
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`
- `noImplicitReturns: true` — all code paths must return
- No generic type params on `chrome.runtime.sendMessage` — cast the response or use `message.type` dispatch

## Project Structure

```
entrypoints/
  background/     # Service worker: message handlers, session, pairing, API relay, offscreen mgmt
  content/        # Content scripts (runs on *://*.lhv.ee/* and *://*.youtube.tomabel.ee/* only)
  popup/          # React popup UI — lazy-loaded panels wrapped in ErrorBoundary
  auth/           # WebAuthn MFA registration/authentication page
  offscreen-webrtc/ # Offscreen document for WebRTC data channel + signaling
lib/
  channel/        # Noise XX handshake, command client, emoji SAS, QR code
  crypto/         # WebAuthn PRF credential creation/assertion
  transport/      # Unified Transport interface — WebRtcTransport + UsbTransport managed by TransportManager with auto-failover
  rateLimit/      # Sliding window + domain-scoped rate limiters
  transaction/    # Bank-specific transaction detectors (only LHV currently)
  errors.ts       # ExtensionError hierarchy, handleExtensionError(), dev-only log
  retry.ts        # withRetry() exponential backoff with jitter, isRetryableError()
  replayProtection.ts  # WebAuthn assertion replay cache (window + max size)
  piiFilter.ts    # Credit card (Luhn), email, phone, password redaction
  domainParser.ts # URL parsing with multi-level TLD support (co.uk, com.au, etc.)
types/            # Shared interfaces (MessageType, ExtensionMessage, PairingState, etc.)
openspec/         # Spec-driven change proposals and task definitions
e2e/              # Playwright E2E tests and fixture pages
signaling-server/ # WebSocket signaling server (deployed separately to Fly.io)
turn-server/      # Coturn TURN server config (deployed separately to Fly.io)
```

## Architecture

- **Phase 1 (current)**: WebRTC-based phone-as-vault with cloud signaling. See `ARCHITECTURE.md` for full blueprint.
- **Phase progression**: WebRTC → USB AOA bridge (Phase 1.5) → zkTLS + NDK enclave (Phase 2/V6). `SMARTID_VAULT_v6.md` is the ultimate spec.
- **Zero persistent crypto on SSD**: Session lives in `chrome.storage.session` (RAM-only, wiped on browser close). When WebAuthn PRF is unavailable, falls back to `chrome.storage.local` persistence.
- **Transport abstraction**: `TransportManager` (`lib/transport/`) unifies WebRTC and USB transports. Auto-failover: USB preferred when available, falls back to WebRTC.
- **Silent re-authentication**: WebAuthn PRF extension derives a Noise keypair from platform biometric to re-establish session without user interaction.
- **Offscreen document**: Background script manages offscreen document lifecycle for WebRTC keepalive (survives service worker sleep). `entrypoints/background/offscreenWebrtc.ts` handles create/close/state.
- **Content script**: Only injects on `lhv.ee` and `youtube.tomabel.ee`. Uses `wxt:locationchange` for SPA navigation. Uses `document.location.href` (never `browser.tabs.query`). Login form detection via MutationObserver with debounce.
- **Pairing flow**: QR code → WebRTC + E2EE signaling → Noise XX handshake → 3-emoji SAS human verification → paired.
- **4-layer panel routing in popup**: unpaired→PairingPanel, paired+credential→CredentialPanel, paired+session→TransactionPanel, paired+no session→AuthPanel.
- **Rate limiting**: MFA assertions: 3/min sliding window. Credential requests: 1/30s per domain. Content script: 10/min with exponential backoff.

## Messaging

- All messages follow `{ type: MessageType, payload: T }` from `types/index.ts`
- All handlers return `{ success: boolean, data?: unknown, error?: string }`
- Content scripts always return `true` from `onMessage` listeners (Chrome MV3 requirement for async `sendResponse`)
- Tab ID resolution: prefer `sender.tab?.id` (content scripts), fallback to `browser.tabs.query` (popup)
- Wrap `browser.tabs.sendMessage` with 5s timeout via `withTimeout()` from `lib/asyncUtils.ts`
- Check context validity before accessing extension APIs in content scripts

## Testing

- Unit tests co-located: `*.test.ts` / `*.test.tsx` (Vitest + jsdom + mock `fakeBrowser` from `wxt/testing`)
- E2E tests in `e2e/`: Chromium headless, `--load-extension=.output/chrome-mv3/`, CI-aware (retries: 2, workers: 1)
- Extension ID resolved from `.output/chrome-mv3/manifest.json` at runtime in Playwright config
- Pre-commit: Husky → `lint-staged` (auto-fix ESLint and Prettier on staged files)

## Key Gotchas

- `fix-manifest.js` deletes `background.type` from the generated manifest (WXT adds `"type": "module"` which Chrome MV3 rejects for service workers)
- Do NOT use `wxt/utils/` barrel imports — import from the specific subpath (e.g. `wxt/utils/define-background`)
- Offscreen document URLs are hardcoded as `'offscreen-webrtc.html'` in background scripts
- TURN credentials are fetched from signaling server at `/turn-credentials` endpoint
- `npm-run-all` is NOT available — all parallel scripts use `&` shell operator
