import type { Detector, TransactionResult } from './detector';
import { createLhvDetector } from './detectors/lhvDetector';

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

  return {
    success: false,
    error: 'No detector available for this page',
  };
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
