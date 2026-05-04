## Why

Content scripts are currently hardcoded in `wxt.config.ts` for only `lhv.ee` and `youtube.tomabel.ee`. A general credential manager must auto-fill on any domain the user visits. Chrome MV3 restricts static content scripts and requires explicit `host_permissions` or dynamic `chrome.scripting.registerContentScripts` for broad page access. Without dynamic injection, the credential manager is limited to two hardcoded sites.

## What Changes

Add dynamic content script registration via `chrome.scripting.registerContentScripts` with user-facing permission prompts. On first visit to an unapproved domain with a login form, the content script detects the form and the background shows a popup notification asking the user to approve the domain. Approved domains are persisted in `chrome.storage.sync` and registered as dynamic scripts. A new Settings panel in the popup lists approved domains with a "Revoke" button. The `scripting` permission is added to the manifest.

## Capabilities

### New Capabilities
- `dynamic-script-registration`: Register content scripts at runtime for user-approved domains via `chrome.scripting.registerContentScripts`
- `domain-permission-prompt`: Popup notification on first login form detection on unknown domain, with accept/deny
- `approved-domains-manager`: UI in popup settings to view and revoke approved domains
- `persistent-domain-whitelist`: `chrome.storage.sync`-backed list of approved domains synced across browser instances

### Existing Capabilities Modified
- `content-script-main`: Add `login-form-detected-unapproved` message for unknown domains
- `background-message-handlers`: Add handler for domain approval flow
- `popup-app`: Add Settings panel with approved domains list
