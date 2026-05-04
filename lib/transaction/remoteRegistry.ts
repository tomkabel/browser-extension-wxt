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

let cachedDetectors: DeclarativeDetector[] | null = null;
let cacheTimestamp = 0;

function compileDetectors(detectors: DeclarativeDetector[]): DeclarativeDetector[] {
  return detectors.map((d) => {
    try {
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
    const data = (await response.json()) as {
      version?: number;
      detectors?: DeclarativeDetector[];
    };
    return data.detectors ? compileDetectors(data.detectors) : [];
  } catch {
    return [];
  }
}

export async function initializeRegistry(): Promise<void> {
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
