import type { Detector, TransactionResult } from './detector';
import { createLhvDetector } from './detectors/lhvDetector';
import {
  findDeclarativeDetector,
  detectWithDeclarativeSelectors,
} from './remoteRegistry';

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
  const bodyText = document.body?.innerText ?? '';
  const amountPattern = /[\u20ac\d\s,]*\d+[.,]\d{2}\s*(?:EUR|€)?/;
  const ibanPattern = /EE\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}/;

  const amountMatch = bodyText.match(amountPattern);
  const ibanMatch = bodyText.match(ibanPattern);

  if (amountMatch || ibanMatch) {
    const result: Partial<TransactionResult> = {};
    if (amountMatch) result.amount = amountMatch[0]!.trim();
    if (ibanMatch) result.iban = ibanMatch[0]!.trim();

    const recipientLabel = bodyText.match(
      /(?:saaja|recipient|beneficiary|to\s*account)[^]*?(?:\n|$)/i,
    );
    if (recipientLabel) {
      const cleaned = recipientLabel[0]!.replace(
        /(?:saaja|recipient|beneficiary|to\s*account)[:\s]*/i,
        '',
      ).trim();
      if (cleaned.length > 0 && cleaned.length < 100) {
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
