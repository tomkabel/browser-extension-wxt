## Context

Content scripts in `wxt.config.ts` are statically declared with `matches: ["*://*.lhv.ee/*", "*://*.youtube.tomabel.ee/*"]`. For a general credential manager, the extension must inject on any domain the user visits. Chrome MV3 allows dynamic content script registration via `chrome.scripting.registerContentScripts()` but requires the `scripting` permission and user-facing domain approval.

## Goals / Non-Goals

**Goals:**
- Detect login forms on any domain via content script MutationObserver
- On first visit to a new domain with a login form, prompt user to approve auto-fill
- Persist approved domains in `chrome.storage.sync`
- Register dynamic content scripts for approved domains
- Provide Settings panel in popup to view and revoke approved domains

**Non-Goals:**
- Bulk import/export of approved domains
- Per-domain granularity beyond on/off (e.g., specific URLs)
- Automatic rejection of sensitive domains (banking, government)

## Decisions

### Decision 1: `chrome.scripting` for dynamic registration

The `scripting` permission is added to `wxt.config.ts`. Dynamic scripts reference the same content script JS file as the static scripts but scoped to the approved domain. Chrome applies these scripts on page load, matching the static script's behavior.

```typescript
await chrome.scripting.registerContentScripts([{
  id: `credential-fill-${domainHash}`,
  matches: [`*://*.${domain}/*`],
  js: ['content-scripts/content.js'],
  runAt: 'document_end',
  persistAcrossSessions: true,
}]);
```
The `domainHash` is a SHA-256 prefix (first 8 hex chars) to prevent ID collision.

### Decision 2: Permission prompt via popup notification badge

On login form detection on an unapproved domain, the content script sends `login-form-detected-unapproved` to the background. The background sets a badge on the extension icon. When the user opens the popup, it shows a "New Domain" section at the top with the domain name, "Allow" and "Deny" buttons. No Chrome-native permission UI required.

### Decision 3: Settings panel with domain list

Add a Settings panel accessible from a gear icon in the popup header. It lists all approved domains with a "Revoke" button for each. Revoking a domain calls `chrome.scripting.unregisterContentScripts({ ids: [...] })` and removes it from `chrome.storage.sync`.

## Risks / Trade-offs

- [Risk] `persistAcrossSessions: true` may not survive extension update — Chrome resets dynamic scripts on update. Mitigation: on background startup, iterate `chrome.storage.sync` approved domains and re-register any missing scripts.
- [Risk] Domain hash collision in script ID — Probability of 8-hex-char collision over 1000 domains is ~0.002%. Mitigation: use full SHA-256 hex string as ID.
- [Risk] User confusion from permission prompt on first visit — Mitigation: show the prompt only on login form detection (password field present), not on every page load.
