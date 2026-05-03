## Context

The extension's content script injects on matched domains but only reports domain changes on SPA `wxt:locationchange` events — never on initial page load. This means the background has no domain state for any tab when the user opens the popup. Additionally, the health check path and default API endpoint need updating to `https://youtube.tomabel.ee/health`.

The previous archived change (`2026-05-01-fix-tab-domain-detection`) fixed the messaging direction (Content → Background via `runtime.sendMessage` instead of self-messaging via `tabs.sendMessage`) but left the initial-load gap unaddressed.

## Goals / Non-Goals

**Goals:**

- Send an initial `tab-domain-changed` message when the content script loads so the background records the domain immediately
- Add `*://*.youtube.tomabel.ee/*` to content script match patterns
- Change health check path from `/api/health` to `/health`
- Update default API endpoint fallback from `https://api.example.com` to `https://youtube.tomabel.ee`

**Non-Goals:**

- Changing how SPA navigation domain updates work (already correct)
- Adding configurable health endpoint URL separate from API endpoint (keep single endpoint base)
- Changing `send-to-api` path or behavior

## Decisions

### 1. Initial Domain Message on Content Script Startup

**Decision**: Send `tab-domain-changed` immediately in `main()`, before registering the `wxt:locationchange` listener.

**Rationale**: The content script already has `window.location.href` available at startup. Sending an initial message ensures the background always has domain state for the tab, even if the user never navigates. The existing deduplication logic in `TabStateManager.updateTabDomain` (1-second cache TTL) prevents redundant updates if a SPA navigation fire immediately after.

**Alternatives considered**:
- *Lazy lookup (background queries content script on demand)*: Adds latency to popup open, requires `tabs.sendMessage` from background to content, more complex.
- *No initial message, just fix popup to query directly*: Would require `browser.tabs.query` in background, which is fragile and was already removed for good reason.

### 2. Match Pattern Update

**Decision**: Add `*://*.youtube.tomabel.ee/*` as a second entry in `matches`.

**Rationale**: The content script only injects on pages matching its `matches` list. Without this entry, the extension cannot function on `youtube.tomabel.ee`. Adding a second pattern has no impact on the existing `lhv.ee` behavior.

### 3. Health Endpoint Path and URL

**Decision**: Change the health check URL to `${endpoint}/health` (remove `/api` prefix) and update the fallback to `https://youtube.tomabel.ee`.

**Rationale**: The user's specified health URL is `https://youtube.tomabel.ee/health` — a top-level `/health` path, not nested under `/api`. The `send` method still uses `/api/dom-content`, which is correct since only the health endpoint was mentioned for change.

## Risks / Trade-offs

- **Content script sends message before `registerContentHandlers()`**: The `tab-domain-changed` message fires before background's listener could theoretically miss it. Mitigation: background registers handlers before content scripts can load (WXT guarantees this via manifest ordering).
- **Dual match patterns increase injection scope**: The content script now runs on two domain families. Mitigation: this is intentional; the content script is lightweight and only reads DOM on explicit request.
- **Health path change is a breaking API contract**: If `youtube.tomabel.ee` expects the health check at `/api/health` instead of `/health`, the check will fail. Mitigation: the user explicitly requested `/health`.
