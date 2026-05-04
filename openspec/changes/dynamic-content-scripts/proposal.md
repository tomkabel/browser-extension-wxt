## Why

Content scripts are currently hardcoded in the manifest for only `lhv.ee` and `youtube.tomabel.ee`. A general credential manager must auto-fill on any domain the user visits. Chrome MV3 restricts static content scripts and requires explicit `host_permissions` or dynamic `chrome.scripting.registerContentScripts` for broad page access. Without dynamic injection, the credential manager is limited to two hardcoded sites.

The current approach registers the content script with `matches: ["*://*.lhv.ee/*"]` and has hardcoded domain checks. This means every new bank or service requires an extension update (Chrome Web Store review: 1-3 days).

The fix uses `matches: ["*://*/*"]` with `all_frames: false` — the content script runs on every page but self-destructs if the domain is not in the approved list. This eliminates the hardcoded domain requirement and makes the extension universally compatible.

## What Changes

- **Universal content script injection**: Change `wxt.config.ts` content script matches from `["*://*.lhv.ee/*"]` to `["*://*/*"]`. The content script checks the registrable domain against `chrome.storage.sync` approved domains. If not approved AND no login form detected, the content script unregisters itself.
- **Dynamic content script registration** (existing): `chrome.scripting.registerContentScripts` for approved domains with `persistAcrossSessions: true`. Re-register on background startup.
- **Domain permission prompt** (existing): On login form detection on unapproved domain, badge notification + popup prompt for Allow/Deny.
- **Persistent domain whitelist** (existing): `chrome.storage.sync`-backed list of approved domains synced across browser instances.
- **Settings panel** (existing): Popup settings with approved domain list and Revoke buttons.
- **Self-destruct pattern**: Content script running on non-approved, non-financial domain detects no password field within 3 seconds → unregisters itself via `chrome.scripting.unregisterContentScripts`. Reduces memory overhead on non-target pages.

## Capabilities

### New Capabilities
- `universal-content-script`: `matches: ["*://*/*"]` with self-destruct for non-approved domains
- `self-destruct-pattern`: Content script detects no login form within timeout → unregisters itself

### Existing Capabilities
- `dynamic-script-registration`: Register content scripts at runtime for user-approved domains via `chrome.scripting.registerContentScripts`
- `domain-permission-prompt`: Popup notification on first login form detection on unknown domain, with accept/deny
- `approved-domains-manager`: UI in popup settings to view and revoke approved domains
- `persistent-domain-whitelist`: `chrome.storage.sync`-backed list of approved domains synced across browser instances

## Impact

- **`wxt.config.ts`**: Content script `matches` changed to `["*://*/*"]`. Remove `exclude_matches` for hardcoded domains.
- **Content script** (`entrypoints/content/index.ts`): Remove `HARDCODED_DOMAINS` constant. Add self-destruct logic: after 3 seconds with no password field detected, unregister.
- **Performance**: Content script runs on every page but self-destructs within 3 seconds if no login form. The MutationObserver is the main cost — limited to DOM mutations, not CPU-bound.
- **Permissions**: `host_permissions` changed from specific domains to `["*://*/*"]`. User must accept this broader permission on install.

## Dependencies

- Requires `scripting` permission for dynamic registration and unregistration.
- Requires `host_permissions: ["*://*/*"]` — user may be reluctant. Mitigation: use optional permissions with a prompt explaining why broad access is needed.
- Self-destruct: `chrome.scripting.unregisterContentScripts({ ids: [selfId] })`. The content script knows its own script ID via a runtime check.
