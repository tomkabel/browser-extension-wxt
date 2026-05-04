## Context

Content scripts in `wxt.config.ts` are statically declared. Currently they match specific domains. For a general credential manager, the extension must detect login forms on any domain the user visits. Chrome MV3 allows broad `matches: ["*://*/*"]` patterns but at the cost of running the content script on every page load.

The key insight: content scripts are lightweight until they find a login form. The MutationObserver only activates on DOM mutations. The self-destruct pattern limits runtime to a maximum of 3 seconds on non-login pages.

### Architecture

```
Page Load → Content Script injected (matches: *://*/*)
  │
  ├─ Check: registrableDomain in approvedDomains?
  │   ├─ YES → activate credential auto-fill (MutationObserver)
  │   └─ NO  → continue
  │
  ├─ Start MutationObserver for password field detection
  │
  ├─ After 1.5s: emitLoginForm() if password field found
  │   ├─ Approved domain → send detect-login-form
  │   └─ Unapproved domain → send login-form-detected-unapproved
  │
  └─ After 3s: if no password field found
      └─ Self-destruct: unregisterContentScripts({ ids: [selfId] })
```

## Goals / Non-Goals

**Goals:**
- Universal `*://*/*` content script matching (no hardcoded domains)
- Self-destruct on non-login pages within 3 seconds
- Detect login forms on any domain via MutationObserver
- On first visit to new domain with login form, prompt user to approve
- Persist approved domains in `chrome.storage.sync`
- Register dynamic content scripts for approved domains
- Settings panel in popup to view and revoke approved domains

**Non-Goals:**
- Bulk import/export of approved domains
- Per-domain granularity beyond on/off
- Automatic rejection of sensitive domains (user chooses)

## Decisions

### Decision 1: Universal `*://*/*` Matching

Change `wxt.config.ts` content script declaration:

```typescript
// Before
contentScripts: [
  {
    matches: ['*://*.lhv.ee/*', '*://*.youtube.tomabel.ee/*'],
    // ...
  },
]

// After
contentScripts: [
  {
    matches: ['*://*/*'],
    excludeMatches: [
      '*://*.google.com/*',   // Known non-financial domains
      '*://*.facebook.com/*',
      '*://*.youtube.com/*',
      '*://*.reddit.com/*',
      '*://*.github.com/*',
      '*://*.stackoverflow.com/*',
      '*://*.wikipedia.org/*',
    ],
    // ...
  },
]
```

The `excludeMatches` list prevents the script from running on known non-financial domains, reducing overhead. Users can add custom exclusions via popup settings.

### Decision 2: Self-Destruct Pattern

The content script self-destructs if no login form is detected within 3 seconds:

```typescript
const selfDestructTimer = setTimeout(() => {
  if (!loginFormEmitted) {
    // No login form found — unregister this script
    chrome.scripting.unregisterContentScripts({
      ids: [ctx.scriptId],
    }).catch(() => {});
  }
}, 3000);

ctx.onInvalidated(() => {
  clearTimeout(selfDestructTimer);
  // Cleanup done
});
```

The script ID is obtained from the content script context (`ctx.scriptId` in WXT). If the user navigates to a login page later, the script is re-injected by Chrome (matches pattern still applies).

### Decision 3: Dynamic Registration for Approved Domains

When a user approves a domain, the background registers a persistent content script:

```typescript
await chrome.scripting.registerContentScripts([{
  id: `credential-fill-${domainHash}`,
  matches: [`*://*.${domain}/*`],
  js: ['content-scripts/content.js'],
  runAt: 'document_idle',
  persistAcrossSessions: true,
}]);
```

This separate registration ensures the script is active even if the user has excluded the domain's TLD in the global exclude list.

### Decision 4: Permission Prompt via Popup

On login form detection on an unapproved domain:
1. Content script sends `login-form-detected-unapproved` to background
2. Background sets badge text to count of pending approvals
3. Popup opens, shows "New Domain" section at top with Allow/Deny
4. User taps Allow → domain added to approved list → script registered → credential request proceeds
5. User taps Deny → domain added to in-session deny list → no further prompts for this session

## Risks / Trade-offs

- [Risk] `*://*/*` host permission is invasive — Users may be reluctant to grant broad access. Mitigation: use optional permissions with a clear explanation. On install, prompt: "SmartID2 needs to detect login forms on any website. This data never leaves your browser without your approval."
- [Risk] Self-destruct timer may fire before login form renders — SPAs and slow-loading pages may render login forms after 3 seconds. Mitigation: the MutationObserver watches for password field additions and resets the self-destruct timer. As long as DOM mutations are happening, the timer extends.
- [Risk] `excludeMatches` list may miss domains — Users can add custom exclusions in Settings. The exclude list is a performance optimization, not a security boundary.
- [Trade-off] Static hardcoded domains vs universal matching — Universal matching adds processing overhead on every page but eliminates the need for extension updates for new banks. The self-destruct pattern limits this to 3 seconds per page. Given the memory profile of a MutationObserver (<1MB), this is acceptable.
