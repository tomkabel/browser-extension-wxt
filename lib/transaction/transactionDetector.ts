import type { Detector, TransactionResult } from './detector';
import { createLhvDetector } from './detectors/lhvDetector';
import { findDeclarativeDetector, detectWithDeclarativeSelectors } from './remoteRegistry';

const AMOUNT_PATTERN = /[\u20ac\d\s,]*\d+[.,]\d{2}\s*(?:EUR|€)?/;

let detectors: Detector[] | null = null;

function getDetectors(): Detector[] {
  if (!detectors) {
    detectors = [createLhvDetector()];
  }
  return detectors;
}

export function registerDetector(detector: Detector): void {
  if (!detectors) {
    detectors = [];
  }
  detectors.push(detector);
}

export interface DetectResult {
  success: boolean;
  transaction?: TransactionResult;
  detectorName?: string;
  error?: string;
}

export function detectTransaction(): DetectResult {
  const currentUrl = document.location.href;

  for (const detector of getDetectors()) {
    if (!detector.urlPattern.test(currentUrl)) {
      continue;
    }

    try {
      const result = detector.detect();

      if (!result) {
        return {
          success: false,
          detectorName: detector.name,
          error: 'No transaction detected on this page',
        };
      }

      return {
        success: true,
        transaction: result,
        detectorName: detector.name,
      };
    } catch (err) {
      return {
        success: false,
        detectorName: detector.name,
        error: err instanceof Error ? err.message : 'Detector failed',
      };
    }
  }

  const declarativeDetector = findDeclarativeDetector(currentUrl);
  if (declarativeDetector) {
    try {
      const result = detectWithDeclarativeSelectors(declarativeDetector);
      if (result) {
        return {
          success: true,
          transaction: result,
          detectorName: `registry:${declarativeDetector.domain}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        detectorName: `registry:${declarativeDetector.domain}`,
        error: err instanceof Error ? err.message : 'Declarative detection failed',
      };
    }
  }

  const semanticResult = trySemanticDetection();
  if (semanticResult) {
    return {
      success: true,
      transaction: semanticResult,
      detectorName: 'semantic',
    };
  }

  return {
    success: false,
    error: 'No detector available for this page',
  };
}

function trySemanticDetection(): TransactionResult | null {
  const scope = findTransactionScope();
  if (!scope) return null;

  const text = scope instanceof HTMLElement ? (scope.innerText ?? scope.textContent ?? '') : (scope.textContent ?? '');
  const ibanPattern = /\bEE\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/;

  const amountMatch = text.match(AMOUNT_PATTERN);
  const ibanMatch = text.match(ibanPattern);

  if (amountMatch || ibanMatch) {
    const result: Partial<TransactionResult> = {};
    if (amountMatch) result.amount = amountMatch[0]!.trim();
    if (ibanMatch) result.iban = ibanMatch[0]!.trim();

    const recipientLabel = text.match(
      /(?:saaja|recipient|beneficiary|to\s*account)[:\s]*([^\n]{1,120})(?=\s*(?:viitenumber|selgitus|amount|sum|iban|\||$))/i,
    );
    if (recipientLabel) {
      const cleaned = recipientLabel[1]!.trim();
      if (cleaned.length > 0) {
        result.recipient = cleaned;
      }
    }

    if (result.amount || result.recipient) {
      return {
        amount: result.amount ?? '',
        recipient: result.recipient ?? '',
        iban: result.iban,
      };
    }
  }

  return null;
}

function findTransactionScope(): Element | null {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return NodeFilter.FILTER_REJECT;
        if (el.offsetParent === null && tag !== 'BODY' && tag !== 'HTML') return NodeFilter.FILTER_REJECT;
        if (el.closest('[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.textContent) continue;
    if (AMOUNT_PATTERN.test(node.textContent)) {
      let el: Element | null = node.parentElement;
      while (el && el !== document.body) {
        const tag = el.tagName;
        if (tag === 'TD' || tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'LI' || tag === 'MAIN') {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    }
  }

  return null;
}

export function getDetectionStatus(): {
  pageDetected: boolean;
  detectorName: string | null;
  message: string;
} {
  const result = detectTransaction();

  if (result.success) {
    return {
      pageDetected: true,
      detectorName: result.detectorName ?? null,
      message: 'Transaction detected',
    };
  }

  return {
    pageDetected: false,
    detectorName: result.detectorName ?? null,
    message: result.error ?? 'Cannot detect',
  };
}
