import type { Detector, TransactionResult } from '../detector';

export function createLhvDetector(): Detector {
  return {
    name: 'lhv.ee',
    urlPattern: /lhv\.ee/,
    detect(): TransactionResult | null {
      try {
        const amount = extractAmount();
        const recipient = extractRecipient();
        const iban = extractIban();

        if (!amount || !recipient) {
          return null;
        }

        return { amount, recipient, iban: iban ?? undefined };
      } catch {
        return null;
      }
    },
  };
}

function extractAmount(): string | null {
  const selectors = [
    '.amount-value',
    '.transaction-amount',
    '[data-test-id="transaction-amount"]',
    '.payment-amount',
    '.sum',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent) {
      const cleaned = el.textContent.replace(/\s+/g, ' ').trim();
      if (/\d/.test(cleaned)) return cleaned;
    }
  }

  return null;
}

function extractRecipient(): string | null {
  const selectors = [
    '.recipient-name',
    '.beneficiary-name',
    '[data-test-id="beneficiary"]',
    '.payment-receiver',
    '.receiver',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent) {
      const cleaned = el.textContent.replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 2) return cleaned;
    }
  }

  return null;
}

function extractIban(): string | null {
  const selectors = [
    '.iban',
    '.account-number',
    '[data-test-id="beneficiary-iban"]',
    '.receiver-account',
    '.account-iban',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent) {
      const cleaned = el.textContent.replace(/\s+/g, '').trim();
      if (/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return cleaned;
    }
  }

  return null;
}
