const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const BLOOM_SIZE = 1024;
const BLOOM_HASHES = 3;
const CM_SKETCH_WIDTH = 256;
const CM_SKETCH_DEPTH = 4;
const FREQUENCY_THRESHOLD = 3;

abstract class HashFunction {
  abstract hash(input: string): number;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createBloomFilter() {
  const bits = new Uint8Array(Math.ceil(BLOOM_SIZE / 8));

  function getBit(index: number): boolean {
    const byteIdx = Math.floor(index / 8);
    const bitIdx = index % 8;
    return (bits[byteIdx]! & (1 << bitIdx)) !== 0;
  }

  function setBit(index: number): void {
    const byteIdx = Math.floor(index / 8);
    const bitIdx = index % 8;
    bits[byteIdx] = (bits[byteIdx]! | (1 << bitIdx)) as number;
  }

  function hashWithSeed(input: string, seed: number): number {
    const h = fnv1a(seed + input);
    return h % BLOOM_SIZE;
  }

  function add(input: string): void {
    for (let i = 0; i < BLOOM_HASHES; i++) {
      setBit(hashWithSeed(input, i));
    }
  }

  function mightContain(input: string): boolean {
    for (let i = 0; i < BLOOM_HASHES; i++) {
      if (!getBit(hashWithSeed(input, i))) return false;
    }
    return true;
  }

  return { add, mightContain };
}

function createCountMinSketch() {
  const table: Uint8Array[] = [];
  for (let i = 0; i < CM_SKETCH_DEPTH; i++) {
    table.push(new Uint8Array(CM_SKETCH_WIDTH));
  }

  function hashFor(input: string, depth: number): number {
    const h = fnv1a(depth.toString() + input);
    return h % CM_SKETCH_WIDTH;
  }

  function increment(input: string): void {
    for (let i = 0; i < CM_SKETCH_DEPTH; i++) {
      const idx = hashFor(input, i);
      const val = table[i]![idx]!;
      if (val < 255) table[i]![idx] = (val + 1) as number;
    }
  }

  function estimate(input: string): number {
    let min = Infinity;
    for (let i = 0; i < CM_SKETCH_DEPTH; i++) {
      const idx = hashFor(input, i);
      min = Math.min(min, table[i]![idx]!);
    }
    return min;
  }

  return { increment, estimate };
}

const bloomFilter = createBloomFilter();
const cmSketch = createCountMinSketch();
const timestampCache = new Map<string, number>();
let cacheSize = 0;
const MAX_CACHE_SIZE = 100;

export function isReplayAssertion(tuple: string): boolean {
  const ts = timestampCache.get(tuple);
  if (ts && Date.now() - ts < REPLAY_WINDOW_MS) return true;

  if (bloomFilter.mightContain(tuple)) {
    cmSketch.increment(tuple);
    if (cmSketch.estimate(tuple) > FREQUENCY_THRESHOLD) return true;
  }

  return false;
}

export function recordAssertion(tuple: string): void {
  bloomFilter.add(tuple);
  timestampCache.set(tuple, Date.now());
  cacheSize++;

  if (cacheSize > MAX_CACHE_SIZE) {
    const cutoff = Date.now() - REPLAY_WINDOW_MS;
    for (const [key, ts] of timestampCache) {
      if (ts < cutoff) {
        timestampCache.delete(key);
        cacheSize--;
      }
    }
  }
}

export function getReplayStats(): { bloomEntries: number; cacheSize: number } {
  return {
    bloomEntries: bloomFilter.mightContain('') ? 0 : 0,
    cacheSize,
  };
}
