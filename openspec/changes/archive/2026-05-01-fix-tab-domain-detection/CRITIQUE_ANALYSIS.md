# OpenSpec Analysis: fix-tab-domain-detection

## Combined Critical Issues

This document consolidates and addresses **ALL issues** raised in the two independent critiques of the `fix-tab-domain-detection` change. Issues are categorized by severity and root cause.

---

## CRITICAL SECURITY FAILURES

### Issue 1: `<all_urls>` + `tabs` Permission Combination

**Location**: proposal.md:27, design.md:33-36, tasks.md:1.2-1.3, specs/domain-detection/spec.md:51-56

**Problem**:

- Tasks 1.2 and 1.3 are marked "pending" but the specs treat them as required
- The WXT Security Rule 3 explicitly states: "Scope host_permissions — narrow to specific domains, never `<all_urls>`"
- The `tabs` permission triggers Chrome's "Read your browsing history" warning and is **completely unnecessary**

**Technical Clarification**:

- `browser.tabs.query({ active: true, currentWindow: true })` works in popup context with just `activeTab`
- The actual bug (domScraper.ts:32 calling tabs.query from content script) is self-inflicted — a content script is already scoped to one tab
- Adding `tabs` + `scripting` + `<all_urls>` is a sledgehammer fix for a self-inflicted wound

**Resolution**:

- REMOVE tasks 1.2 and 1.3 permanently — they are security vulnerabilities, not features
- Use `optional_host_permissions: ["*://*.lhv.ee/*"]` with runtime request instead
- The content script should use `document.location` directly, not `tabs.query`

---

### Issue 2: PII Filtering is Theatrical Security

**Location**: lib/piiFilter.ts, domScraper.ts:56

**Problems**:

1. Credit card regex `/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g`:
   - Misses AMEX (15 digits)
   - Misses non-spaced cards (16 digits straight)
   - False positives on dates (12/25/2024 matches pattern)

2. `filterSensitiveInputFields` operates on HTML patterns against **text content**:
   - By the time `filterDomContent` is called at domScraper.ts:56, HTML structure is already lost
   - Password input `value` attributes are never in `innerText` — this function filters nothing useful

3. Rule 15 violation: "Avoid storing sensitive data in DOM"
   - The page's own scripts can read the DOM before the content script loads on banking sites like lhv.ee

**Resolution**:

- **Option A (Remove)**: Remove PII filtering entirely. Acknowledge in spec that content extraction is not secure for banking sites and should not be used there.
- **Option B (Fix properly)**: Extract HTML first, filter sensitive elements before getting innerText, use proper PII detection library like `pii-utils`.

---

### Issue 3: Empty web_accessible_resources

**Location**: wxt.config.ts:26-31

**Problem**: Empty block serves no purpose and is a fingerprinting surface.

**Resolution**: Remove `web_accessible_resources` entry entirely if not used.

---

## CRITICAL ARCHITECTURE BUGS

### Issue 4: Domain Tracker Sends Messages to Itself (DEAD FLOW)

**Location**: entrypoints/content/domainTracker.ts:21-25

**Problem**:

```typescript
browser.tabs.sendMessage(tab.id, {
  type: 'tab-domain-changed',
  ...
})
```

- `tabs.sendMessage(tabId, ...)` delivers to **content scripts** on that tab, NOT the background
- The background handler in messageHandlers.ts will **never receive** this message
- Domain tracking flow is completely dead on arrival

**Root Cause**: Specs/domain-detection/spec.md:33-35 describes the correct flow (Content → Background), but implementation uses `tabs.sendMessage` instead of `runtime.sendMessage`

**Resolution**:

- Change to `browser.runtime.sendMessage({ type: 'tab-domain-changed', payload: { ... } })`
- Background receives it with `sender.tab.id` already populated
- Content script does NOT need to know its own tab ID — sender context provides it

---

### Issue 5: Content Script Queries Its Own Tab

**Location**: domScraper.ts:32

**Problem**:

```typescript
const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
```

- A content script is already running in a tab — it has direct access to `document.location`
- This creates:
  - Unnecessary permission dependency (`tabs`)
  - Race condition if user switches tabs during async scrape
  - Adds latency

**Resolution**:

- Remove `tabs.query` from content script entirely
- Use `window.location.href` and `window.location.hostname` directly
- Tab ID should come from `sender.tab.id` in the message handler, not from tabs.query

---

### Issue 6: getTabIdFromSender Fallback is Dangerous

**Location**: messageHandlers.ts:68-77

**Problem**:

```typescript
async function getTabIdFromSender(sender) {
  if (sender?.tab?.id) return sender.tab.id
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}
```

- If a content script somehow sends a message without sender.tab, the fallback returns the **active** tab in the **current** window
- If user has popup open in Window A but content script is in Window B, this returns wrong tab — cross-tab contamination

**Resolution**:

- Remove the fallback entirely
- If `sender.tab.id` is missing, return an error: "Cannot identify sender tab"
- Every valid message should have proper sender context

---

### Issue 7: Rate Limiter Per-Tab Design is Redundant

**Location**: content/rateLimiter.ts

**Problem**:

- Stores state in `Map<number, RateLimitEntry>` keyed by `tabId`
- But a content script instance only runs in **one tab**
- The `Map` will only ever have one entry
- The `tabId` key is redundant and misleading

**Resolution**:

- Simplify to a single `RateLimitEntry` without Map wrapper
- The "per-tab" concept should be enforced at the background/tabState level, not in content script

---

### Issue 8: TabStateManager Leaks Memory

**Location**: background/tabState.ts

**Problem**:

- Writes to `session:${tabId}:domain` but never cleans up on `tabs.onRemoved`
- The `lastUpdateCache` Map persists indefinitely
- Session storage IS cleared on browser close, but tab-specific keys accumulate during session

**Resolution**:

- Add `browser.tabs.onRemoved` listener to clean up `lastUpdateCache` entries
- Alternatively, rely entirely on session storage TTL (Chrome clears session storage on browser close)

---

## WXT MISUSE

### Issue 9: Wrong Imports Throughout

**Location**: All entrypoints

**Problem**:

```typescript
// WRONG - these paths don't exist in WXT 0.20.x
import { defineBackground } from 'wxt/utils/define-background'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser } from 'wxt/browser'
import { storage } from 'wxt/utils/storage'
```

**Reality**: WXT provides auto-imports. Manual imports from wrong paths suggest misunderstanding of the framework.

**Resolution**:

- Use WXT's built-in auto-imports
- `defineBackground`, `defineContentScript`, `browser` are auto-imported in entrypoint files
- For explicit imports: `import { browser } from 'wxt/browser'` is correct
- Use `storage.defineItem()` correctly — it's already properly imported when used in implementation files

---

### Issue 10: Content Script Ignores WXT Lifecycle API

**Location**: entrypoints/content/index.ts, contentMessageBus.ts

**Problem**:

- Manually manages `window.addEventListener('unload')` and custom `isContextValid` flag
- WXT provides `ctx.onInvalidated()`, `ctx.addEventListener()` that automatically clean up

**Critical Bug**:

- `window.unload` does NOT fire for extension context invalidation (extension reload/update)
- The custom `isContextValid` flag never gets set to false on the correct event

**Resolution**:

```typescript
// WXT provides this:
export default defineContentScript({
  matches: ['<all_urls>'],

  main(ctx) {
    ctx.onInvalidated(() => {
      // Clean up here - this IS called on extension reload/update
    })

    // Use ctx.addEventListener for automatic cleanup
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      // Handle SPA navigation
    })
  },
})
```

---

### Issue 11: Wrong runAt Timing

**Location**: entrypoints/content/index.ts:17

**Problem**: `runAt: 'document_end'`

**Resolution**:

- Use `document_idle` for content extraction scripts
- WXT skill Security Rule 16: "Use document_idle over document_start — less intrusive, more stable"
- For a content extraction script, `document_idle` ensures dynamic content has loaded

---

### Issue 12: Reinventing SPA Detection

**Location**: lib/domainTracker.ts

**Problem**:

- Manually monkey-patches `history.pushState`/`replaceState`
- Breaks sites that already wrap History API
- Fails to clean up properly on context invalidation

**Resolution**:

- WXT provides `ctx.addEventListener(window, 'wxt:locationchange', ...)` for exactly this use case
- Remove manual History API patching entirely
- Let WXT handle SPA navigation detection

---

## IMPLEMENTATION BUGS

### Issue 13: ApiError Recoverability Logic is Backwards

**Location**: lib/errors.ts:38

**Problem**:

```typescript
super(message, 'API_ERROR', statusCode !== undefined && statusCode < 500)
```

- Marks 4xx client errors as `recoverable: true`
- A 400 Bad Request will never succeed on retry

**Resolution**:

```typescript
super(message, 'API_ERROR', statusCode !== undefined && (statusCode >= 500 || statusCode === 429))
```

- Only 5xx server errors and 429 rate limit should be recoverable
- 400, 401, 403, 404 are never recoverable

---

### Issue 14: isRetryableError Retries Programming Errors

**Location**: lib/retry.ts:82

**Problem**:

```typescript
if (error.name === 'AbortError' || error.name === 'TypeError') {
  return true
}
```

- `TypeError` from `fetch()` usually means CORS failure or invalid URL — not transient
- Retrying wastes resources

**Resolution**:

- Remove `TypeError` from retryable errors
- Only retry network errors (AbortError, network failures) and specific 5xx/429

---

### Issue 15: setTimeout Never Cleared in createAbortSignal

**Location**: apiRelay.ts:138-141

**Problem**:

```typescript
function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), timeoutMs)
  return controller.signal // timeout never cleared on success
}
```

**Resolution**:

- Use `AbortSignal.timeout()` (available in modern browsers, 2026 spec)
- Or clear the timeout when fetch completes:

```typescript
const timeout = setTimeout(() => controller.abort(), timeoutMs)
try {
  const response = await fetch(url, { signal: controller.signal })
  clearTimeout(timeout)
  return response
} catch (e) {
  clearTimeout(timeout)
  throw e
}
```

---

### Issue 16: Domain Parser Naive Splitting

**Location**: lib/domainParser.ts:49-51

**Problem**:

```typescript
const subdomain = parts.length > 2 ? parts.slice(0, -2).join('.') : null
const registrableDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname
```

- For `blog.co.uk`, this returns `registrableDomain: "co.uk"` — WRONG
- For `something.blogspot.com`, returns `blogspot.com` — WRONG

**Resolution**:

- Use the Public Suffix List (PSL) via a library like `psl`
- For a banking extension, naive string splitting is unacceptable

---

### Issue 17: KeepAlive is an Anti-Pattern

**Location**: background/keepAlive.ts

**Problem**:

1. Chrome's MV3 docs explicitly discourage fake heartbeats
2. Alarm fires every 60s (minimum per Chrome spec), but SW dies after ~30s of inactivity
3. Heartbeat fires AFTER death — useless
4. `extendLifetime()` does `storage.local.get()` which extends life by seconds, not minutes

**Resolution**:

- REMOVE the KeepAlive module entirely
- For long operations (>30s): use offscreen documents
- For API calls: chunk work, use `navigator.sendBeacon` fallback, or accept ephemeral lifecycle
- Service workers are supposed to be ephemeral — fight the lifecycle model and you lose

---

### Issue 18: Message Handler Pattern is Outdated

**Location**: messageHandlers.ts:79-99

**Problem**:

- Uses legacy `sendResponse` callback pattern with `return true`
- WXT and modern browsers support returning `Promise` directly

**Resolution**:

```typescript
// Modern pattern
browser.runtime.onMessage.addListener((message, sender) => {
  return handler(message.payload, sender) // Returns Promise
})
```

---

## SPEC vs IMPLEMENTATION MISMATCHES

### Issue 19: Type Safety is Theatrical

**Location**: tasks.md:64-66 ("Type-safe message routing" marked complete)

**Problem**:

```typescript
const { tabId, url } = payload as { tabId: number | undefined; domain: string; url: string }
```

- Uses `as` casts, not actual type safety
- "Type-safe message routing" is just `any` with extra steps

**Resolution**:

- Use `@webext-core/messaging` or `webext-bridge` for actual type-safe messaging
- Or accept the current implementation is NOT type-safe and update spec claims

---

### Issue 20: Multiple ScrapeResult Definitions

**Location**: specs/content-extraction/spec.md, domScraper.ts, ContentPanel.tsx

**Problem**: `ScrapeResult` interface duplicated in 3 places with no shared type.

**Resolution**:

- Define once in `types/index.ts`
- Export and import in all other locations

---

### Issue 21: Dead Message Type: content-script-unloaded

**Location**: extension-messaging/spec.md:96, messageHandlers.ts

**Problem**: Spec declares `content-script-unloaded` as Content → Background with no response. Handler does not exist in messageHandlers.ts.

**Resolution**:

- Either implement the handler for cleanup
- Or remove from spec

---

### Issue 22: Dead Code: get-structured-content

**Location**: contentMessageBus.ts:55-61

**Problem**: `handleGetStructured` calls `scrapePage()` with no arguments, identical to `handleReadDom` with default maxLength.

**Resolution**: Remove `get-structured-content` handler — it's dead code.

---

### Issue 23: Duplicate Content Scraping in ApiPanel

**Location**: ApiPanel.tsx:49-57

**Problem**:

- `ApiPanel` independently calls `tabs.sendMessage` for content
- `ContentPanel` also calls `tabs.sendMessage` for content
- Both scrape the same page independently, doubling rate-limit count
- No shared state between panels

**Resolution**:

- Extract content once (in parent or via shared context)
- Pass to both panels
- Or accept this is a design issue

---

## 2026 BEST PRACTICES NOT FOLLOWED

### Issue 24: No Typed Messaging Library

**Problem**: WXT docs recommend `@webext-core/messaging`, `webext-bridge`, or `trpc-chrome`. Implementation uses homemade string-based router.

### Issue 25: No optional_host_permissions

**Problem**: Should use `optional_host_permissions: ["*://*.lhv.ee/*"]` and request at runtime, not upfront.

### Issue 26: No Tests

**Problem**: All 7 testing tasks (7.1-7.7) are pending.

### Issue 27: No Bundle Analysis

**Problem**: `wxt build --analyze` mentioned in tasks but never run.

---

## REQUIRED CHANGES TO SPECS

### Change 1: Remove tasks 1.2 and 1.3 permanently

Tasks asking for `tabs`/`scripting` permissions and `<all_urls>` should be marked **cancelled** (not pending), with explanation that they are security violations.

### Change 2: Fix domain-detection/spec.md Flow Diagram

The flow diagram at specs/domain-detection/spec.md:55-60 shows:

```
Content Script → Background
```

But implementation uses `tabs.sendMessage` (Content → Content). Spec and implementation both need fixing.

### Change 3: Fix extension-messaging/spec.md Flow 1

Same issue — flow diagram shows Content → Background but code does Content → Content.

### Change 4: Clarify content-extraction/spec.md PII limitations

The spec claims PII filtering replaces sensitive data, but implementation cannot filter password fields. Spec should acknowledge this limitation.

### Change 5: Remove tasks 5.1 (Tab not ready error) pending

This is a good feature but was never implemented. Either implement it or remove from pending.

### Change 6: Mark all testing tasks as pending with priority

All 7.1-7.7 testing tasks need to be completed before any production release.

---

## SUMMARY OF REQUIRED ACTIONS

### Must Fix (Blockers)

1. **Fix domain tracker messaging**: Change `tabs.sendMessage` to `runtime.sendMessage` in domainTracker.ts
2. **Remove tabs.query from content script**: Use `document.location` instead
3. **Remove KeepAlive anti-pattern**: Delete keepAlive.ts module entirely
4. **Fix ApiError recoverability**: Change `status < 500` to `status >= 500 || status === 429`
5. **Use WXT lifecycle API**: Replace `window.unload` with `ctx.onInvalidated()`
6. **Remove PII filtering or fix it properly**: Current implementation provides false security
7. **Remove tasks 1.2/1.3 from pending**: Mark as cancelled with security explanation

### Should Fix

8. Use `document_idle` instead of `document_end`
9. Remove History API monkey-patching — use WXT's `wxt:locationchange`
10. Fix `isRetryableError` to not retry TypeError
11. Clear setTimeout in createAbortSignal or use AbortSignal.timeout()
12. Use PSL for domain parsing instead of naive string splitting

### Consider Fixing

13. Implement @webext-core/messaging for type-safe messaging
14. Use optional_host_permissions for runtime requests
15. Add shared content state between ApiPanel and ContentPanel
16. Implement the 7 pending testing tasks
17. Run wxt build --analyze for bundle analysis
18. Clean up dead code (get-structured-content handler)
