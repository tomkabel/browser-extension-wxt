## 1. Content Script — Initial Domain Detection

- [x] 1.1 Send initial `tab-domain-changed` message in `main()` before registering `wxt:locationchange` listener in `entrypoints/content/index.ts`
- [x] 1.2 Add `*://*.youtube.tomabel.ee/*` to content script `matches` array

## 2. API Relay — Health Endpoint Update

- [x] 2.1 Change health check path from `/api/health` to `/health` in `entrypoints/background/apiRelay.ts`
- [x] 2.2 Update default API endpoint fallback from `https://api.example.com` to `https://youtube.tomabel.ee` in `apiRelay.ts`

## 3. Popup & Messaging Fixes

- [x] 3.1 Fix popup entrypoint: pass a no-op function to `defineUnlistedScript(() => {})` instead of an empty object in `entrypoints/popup/index.tsx`
- [x] 3.2 Fix CSP: add `connect-src 'self' https://youtube.tomabel.ee` to `wxt.config.ts`
- [x] 3.3 Fix `get-current-domain` handler: fallback to `browser.tabs.query({ active: true, currentWindow: true })` when `sender.tab` is missing in `messageHandlers.ts`

## 4. Verification

- [x] 4.1 Verify content script sends initial domain message on page load (check background console)
- [x] 4.2 Verify popup opens without `_e.main is not a function` error
- [x] 4.3 Verify popup displays domain immediately on first open (not only after SPA navigation)
- [x] 4.4 Verify health check fetches `https://youtube.tomabel.ee/health` without CSP errors
- [x] 4.5 Verify content script injects on `youtube.tomabel.ee` pages
