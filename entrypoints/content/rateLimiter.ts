/**
 * Per-tab rate limiter to prevent abuse.
 * - Tracks operations per tab
 * - Implements exponential backoff
 * - Auto-resets after cooldown period
 */

// Content script rate limiter - per-content-script-instance (not per-tab Map)
// A content script instance only runs in ONE tab, so single entry is correct
interface RateLimitEntry {
  count: number;
  firstRequest: number;
  backoffUntil: number;
}

export enum RateLimitResult {
  Allowed,
  RateLimited,
  Backoff,
}

let requestEntry: RateLimitEntry | null = null;

const LIMITS = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60 * 1000,
  BACKOFF_BASE_MS: 30 * 1000,
  BACKOFF_MAX_MS: 5 * 60 * 1000,
  BACKOFF_MULTIPLIER: 2,
};

export function checkRateLimit(): RateLimitResult {
  // Note: tabId parameter kept for API compatibility but ignored
  // Content script instance is already scoped to one tab
  const now = Date.now();

  if (!requestEntry) {
    requestEntry = {
      count: 1,
      firstRequest: now,
      backoffUntil: 0,
    };
    return RateLimitResult.Allowed;
  }

  if (requestEntry.backoffUntil > now) {
    return RateLimitResult.Backoff;
  }

  if (now - requestEntry.firstRequest > LIMITS.WINDOW_MS) {
    requestEntry = {
      count: 1,
      firstRequest: now,
      backoffUntil: 0,
    };
    return RateLimitResult.Allowed;
  }

  requestEntry.count++;

  if (requestEntry.count > LIMITS.MAX_REQUESTS) {
    const backoffMs = Math.min(
      LIMITS.BACKOFF_BASE_MS *
        Math.pow(LIMITS.BACKOFF_MULTIPLIER, requestEntry.count - LIMITS.MAX_REQUESTS),
      LIMITS.BACKOFF_MAX_MS,
    );
    requestEntry.backoffUntil = now + backoffMs;
    return RateLimitResult.RateLimited;
  }

  return RateLimitResult.Allowed;
}

export function getRateLimitStatus(): {
  remaining: number;
  backoffMs: number;
  resetIn: number;
} {
  const now = Date.now();

  if (!requestEntry) {
    return { remaining: LIMITS.MAX_REQUESTS, backoffMs: 0, resetIn: 0 };
  }

  const resetIn = Math.max(0, LIMITS.WINDOW_MS - (now - requestEntry.firstRequest));
  const backoffMs = Math.max(0, requestEntry.backoffUntil - now);

  return {
    remaining: Math.max(0, LIMITS.MAX_REQUESTS - requestEntry.count),
    backoffMs,
    resetIn,
  };
}

export function clearRateLimit(): void {
  requestEntry = null;
}

// Cleanup old stale entries from Map (for compatibility with existing calls)
let cleanupIntervalId: number | null = null;

/**
 * Start the cleanup interval for stale rate limit entries.
 * Call this when the content script initializes.
 */
export function startCleanupInterval(): void {
  if (cleanupIntervalId !== null) return;
  cleanupIntervalId = window.setInterval(
    () => {
      // Clean up entries older than 2x window
      const now = Date.now();
      if (requestEntry && now - requestEntry.firstRequest > LIMITS.WINDOW_MS * 2) {
        requestEntry = null;
      }
    },
    5 * 60 * 1000,
  );
}

/**
 * Stop and clear the cleanup interval.
 * Call this when the content script unloads.
 */
export function stopCleanupInterval(): void {
  if (cleanupIntervalId !== null) {
    window.clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}
