const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

const replayCache = new Map<string, number>();

async function deriveKey(tuple: string): Promise<string> {
  const data = new TextEncoder().encode(tuple);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function cleanupExpired(): void {
  const cutoff = Date.now() - REPLAY_WINDOW_MS;
  for (const [k, v] of replayCache) {
    if (v < cutoff) replayCache.delete(k);
  }
}

function trimCache(): void {
  while (replayCache.size > MAX_CACHE_SIZE) {
    const oldestKey = replayCache.keys().next().value;
    if (oldestKey === undefined) break;
    replayCache.delete(oldestKey);
  }
}

export async function checkAndReserveAssertion(tuple: string): Promise<boolean> {
  cleanupExpired();
  const key = await deriveKey(tuple);
  const ts = replayCache.get(key);
  if (ts && Date.now() - ts < REPLAY_WINDOW_MS) return true;

  replayCache.set(key, Date.now());

  if (replayCache.size > MAX_CACHE_SIZE) {
    trimCache();
  }

  return false;
}

/** @deprecated Use checkAndReserveAssertion instead */
export async function isReplayAssertion(tuple: string): Promise<boolean> {
  return checkAndReserveAssertion(tuple);
}

/** @deprecated Use checkAndReserveAssertion instead */
export async function recordAssertion(tuple: string): Promise<void> {
  await checkAndReserveAssertion(tuple);
}

export function getReplayStats(): { cacheSize: number } {
  return { cacheSize: replayCache.size };
}
