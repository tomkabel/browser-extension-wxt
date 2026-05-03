export interface SlidingWindowRateLimiter {
  allow(): boolean;
}

export function createSlidingWindowLimiter(
  windowMs: number,
  maxHits: number,
): SlidingWindowRateLimiter {
  const entries: number[] = [];

  return {
    allow(): boolean {
      const now = Date.now();
      while (entries.length > 0 && now - entries[0]! >= windowMs) {
        entries.shift();
      }
      if (entries.length >= maxHits) {
        return false;
      }
      entries.push(now);
      return true;
    },
  };
}

export function createDomainRateLimiter(windowMs: number): {
  allow: (domain: string) => boolean;
} {
  const entries = new Map<string, number>();

  return {
    allow(domain: string): boolean {
      const last = entries.get(domain);
      const now = Date.now();
      if (last && now - last < windowMs) {
        return false;
      }
      entries.set(domain, now);
      for (const [key, ts] of entries) {
        if (now - ts > windowMs * 2) {
          entries.delete(key);
        }
      }
      return true;
    },
  };
}
