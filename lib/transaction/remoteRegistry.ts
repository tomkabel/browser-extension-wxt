import type { TransactionResult } from './detector';

export interface DeclarativeDetector {
  domain: string;
  urlPattern: string;
  selectors: DetectorSelectors;
  expects: string[];
  controlCode?: ControlCodeSelector;
  compiledPattern?: RegExp;
}

export interface DetectorSelectors {
  amount: string[];
  recipient: string[];
  iban?: string[];
}

export interface ControlCodeSelector {
  css: string[];
  type: 'text' | 'attribute';
  attribute?: string;
}

const KNOWN_LABELS = /^(?:amount|sum|total|recipient|saaja|makse|viitenumber|selgitus|payment|transfer)[:\s]*/i;

function extractCleanText(element: Element): string | null {
  const raw = element.textContent?.trim() ?? null;
  if (!raw) return null;
  const cleaned = raw.replace(KNOWN_LABELS, '').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

const REGISTRY_URL = 'https://raw.githubusercontent.com/smartid2/registry/main/detectors.json';
const CACHE_KEY = 'registry:detectors';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PATTERN_LENGTH = 500;

function hasNestedQuantifier(pattern: string): boolean {
  return /\([^)]*[+*][^)]*\)\s*[+*]/.test(pattern);
}

let cachedDetectors: DeclarativeDetector[] | null = null;
let cacheTimestamp = 0;
let initPromise: Promise<void> | null = null;

const ALLOWED_EXPECT_VALUES = new Set(['amount', 'recipient', 'iban']);

function isValidDetector(d: Record<string, unknown>): boolean {
  if (typeof d.domain !== 'string' || d.domain.length === 0) return false;
  if (typeof d.urlPattern !== 'string' || d.urlPattern.length === 0) return false;
  if (!Array.isArray(d.expects) || d.expects.length === 0) return false;
  if (!d.expects.every((e) => typeof e === 'string' && ALLOWED_EXPECT_VALUES.has(e))) return false;
  if (!d.selectors || typeof d.selectors !== 'object') return false;
  const sels = d.selectors as Record<string, unknown>;
  if (!Array.isArray(sels.amount) || sels.amount.length === 0) return false;
  if (!Array.isArray(sels.recipient) || sels.recipient.length === 0) return false;
  return true;
}

function isSafeUrlPattern(pattern: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  if (hasNestedQuantifier(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function compileDetectors(detectors: DeclarativeDetector[]): DeclarativeDetector[] {
  return detectors.map((d) => {
    try {
      if (!isSafeUrlPattern(d.urlPattern)) {
        return { ...d, compiledPattern: undefined };
      }
      return { ...d, compiledPattern: new RegExp(d.urlPattern) };
    } catch {
      return { ...d, compiledPattern: undefined };
    }
  });
}

async function fetchRegistry(): Promise<DeclarativeDetector[]> {
  try {
    const response = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const raw = (await response.json()) as {
      version?: number;
      detectors?: unknown[];
    };
    if (!Array.isArray(raw.detectors)) return [];
    const valid: DeclarativeDetector[] = [];
    for (const d of raw.detectors) {
      if (d && typeof d === 'object' && isValidDetector(d as Record<string, unknown>)) {
        valid.push(d as unknown as DeclarativeDetector);
      }
    }
    return valid.length > 0 ? compileDetectors(valid) : [];
  } catch {
    return [];
  }
}

export async function loadCached(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    if (stored[CACHE_KEY]) {
      const parsed = stored[CACHE_KEY] as {
        detectors: DeclarativeDetector[];
        timestamp: number;
      };
      cachedDetectors = compileDetectors(parsed.detectors);
      cacheTimestamp = parsed.timestamp;
    }
  } catch {
    // no cache
  }
}

export async function initializeRegistry(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await loadCached();

    if (Date.now() - cacheTimestamp > CACHE_TTL_MS) {
      const fresh = await fetchRegistry();
      if (fresh.length > 0) {
        cachedDetectors = fresh;
        cacheTimestamp = Date.now();
        try {
          await chrome.storage.local.set({
            [CACHE_KEY]: { detectors: fresh, timestamp: cacheTimestamp },
          });
        } catch {
          // storage unavailable
        }
      }
    }
  })();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

export function findDeclarativeDetector(url: string): DeclarativeDetector | null {
  if (!cachedDetectors) return null;

  for (const detector of cachedDetectors) {
    if (detector.compiledPattern?.test(url)) {
      return detector;
    }
  }
  return null;
}

export function detectWithDeclarativeSelectors(
  detector: DeclarativeDetector,
): TransactionResult | null {
  const result: Partial<TransactionResult> = {};

  for (const field of detector.expects) {
    if (field === 'amount') {
      const value = querySelectors(detector.selectors.amount);
      if (value) {
        result.amount = value;
      }
    } else if (field === 'recipient') {
      const value = querySelectors(detector.selectors.recipient);
      if (value) {
        result.recipient = value;
      }
    } else if (field === 'iban' && detector.selectors.iban) {
      const value = querySelectors(detector.selectors.iban);
      if (value) {
        result.iban = value;
      }
    }
  }

  if (!result.amount && !result.recipient) return null;

  return {
    amount: result.amount ?? '',
    recipient: result.recipient ?? '',
    iban: result.iban,
  };
}

function querySelectors(selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const element = document.querySelector(sel);
      if (!element) continue;

      const direct = element.firstChild?.nodeType === Node.TEXT_NODE
        ? element.firstChild.textContent?.trim()
        : null;
      if (direct && direct.length > 0 && !KNOWN_LABELS.test(direct)) {
        return direct;
      }

      const cleaned = extractCleanText(element);
      if (cleaned) return cleaned;
    } catch {
      continue;
    }
  }
  return null;
}

export async function refreshRegistry(): Promise<boolean> {
  const fresh = await fetchRegistry();
  if (fresh.length > 0) {
    cachedDetectors = fresh;
    cacheTimestamp = Date.now();
    try {
      await chrome.storage.local.set({
        [CACHE_KEY]: { detectors: fresh, timestamp: cacheTimestamp },
      });
    } catch {
      // storage unavailable
    }
    return true;
  }
  return false;
}
