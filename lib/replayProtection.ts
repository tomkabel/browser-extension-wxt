const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;
const replayCache = new Map<string, number>();

export function isReplayAssertion(tuple: string): boolean {
  const ts = replayCache.get(tuple);
  if (ts && Date.now() - ts < REPLAY_WINDOW_MS) {
    return true;
  }
  return false;
}

export function recordAssertion(tuple: string): void {
  replayCache.set(tuple, Date.now());
  if (replayCache.size > MAX_CACHE_SIZE) {
    const cutoff = Date.now() - REPLAY_WINDOW_MS;
    for (const [key, ts] of replayCache) {
      if (ts < cutoff) replayCache.delete(key);
    }
  }
}
