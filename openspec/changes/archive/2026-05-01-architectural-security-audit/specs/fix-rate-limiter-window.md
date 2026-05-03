# Fix Rate Limiter Window Reset Logic

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

In `entrypoints/content/rateLimiter.ts:50-57`, when the time window expires (`now - requestEntry.firstRequest > LIMITS.WINDOW_MS`), the entry is reset with `count: 1` but the function does not return immediately. Execution continues to line 59 where `requestEntry.count++` increments the counter to 2 for the same request, effectively deducting two tokens from the new window instead of one. This cuts the effective rate limit in half.

```typescript
// Line 50-56: Reset window
if (now - requestEntry.firstRequest > LIMITS.WINDOW_MS) {
  requestEntry = { count: 1, firstRequest: now, backoffUntil: 0 };
  // Missing: return RateLimitResult.Allowed;
}

requestEntry.count++; // <-- BUG: increments to 2 on reset
```

### Solution

Add `return RateLimitResult.Allowed;` immediately after the window reset block.

### Acceptance Criteria

- A `checkRateLimit()` call that triggers a window reset returns `Allowed` with `count === 1`.
- Unit test verifies that after a window boundary crossing, the count is 1, not 2.
