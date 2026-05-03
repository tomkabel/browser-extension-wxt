/**
 * PII (Personally Identifiable Information) Filter.
 *
 * CRITICAL: This MUST run before ANY data is stored or transmitted.
 * - Redacts credit card numbers (Visa, MC, AMEX, with or without separators)
 * - Redacts SSNs, email addresses, phone numbers
 * - Redacts password-like patterns and credential leaks
 *
 * IMPORTANT: This filter operates on innerText (plain text, not HTML).
 *   It CANNOT filter password <input> values because innerText never
 *   contains input value attributes. DOM scraping on banking pages is
 *   inherently insecure — sensitive fields MUST be excluded at the
 *   extraction layer, not redacted post-hoc.
 *
 * This is a best-effort approach — we err on the side of caution.
 */

export interface FilteredContent {
  text: string;
  hasRedactions: boolean;
  redactionCount: number;
  categories: Set<PiiCategory>;
}

export enum PiiCategory {
  Password = 'password',
  CreditCard = 'credit_card',
  SSN = 'ssn',
  Email = 'email',
  Phone = 'phone',
  Name = 'name',
  Address = 'address',
}

const PATTERNS: Record<PiiCategory, RegExp> = {
  [PiiCategory.Password]: /\b(password|passwd|pwd|secret)\s*[:=]\s*\S+/gi,

  [PiiCategory.CreditCard]: /\b(?:\d[\s-]?){13,19}\b/g,

  [PiiCategory.SSN]: /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g,

  [PiiCategory.Email]: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  [PiiCategory.Phone]: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b/g,

  [PiiCategory.Name]: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,

  [PiiCategory.Address]:
    /\b\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi,
};

const REDACTED = '[REDACTED]';

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits[i]!;
    let n = parseInt(digit, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isValidCardNumber(digits: string): boolean {
  const cleaned = digits.replace(/[\s-]/g, '');
  if (cleaned.length < 13 || cleaned.length > 19) return false;
  return luhnCheck(cleaned);
}

export function filterPii(text: string): FilteredContent {
  let result = text;
  const categories = new Set<PiiCategory>();
  let redactionCount = 0;

  for (const [category, pattern] of Object.entries(PATTERNS)) {
    const matches = result.match(pattern);
    if (!matches || matches.length === 0) {
      continue;
    }

    if (category === PiiCategory.CreditCard) {
      let count = 0;
      result = result.replace(pattern, (match) => {
        if (isValidCardNumber(match)) {
          count++;
          return REDACTED;
        }
        return match;
      });
      if (count > 0) {
        categories.add(PiiCategory.CreditCard);
        redactionCount += count;
      }
    } else {
      categories.add(category as PiiCategory);
      redactionCount += matches.length;
      result = result.replace(pattern, REDACTED);
    }
  }

  return {
    text: result,
    hasRedactions: redactionCount > 0,
    redactionCount,
    categories,
  };
}

export interface DomFilterOptions {
  stripHiddenContent: boolean;
  stripPasswordFields: boolean;
  stripHiddenInputs: boolean;
  maxTextLength: number;
}

const DEFAULT_OPTIONS: DomFilterOptions = {
  stripHiddenContent: true,
  stripPasswordFields: true,
  stripHiddenInputs: true,
  maxTextLength: 50000,
};

export function filterDomContent(
  text: string,
  options: Partial<DomFilterOptions> = {},
): { text: string; filtered: boolean } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const piiResult = filterPii(text);

  let finalText = piiResult.text;
  if (finalText.length > opts.maxTextLength) {
    finalText = finalText.slice(0, opts.maxTextLength) + '\n...[truncated]';
  }

  return {
    text: finalText,
    filtered: piiResult.hasRedactions,
  };
}
