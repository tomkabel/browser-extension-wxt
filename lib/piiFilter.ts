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
  EstonianIdCode = 'estonian_id_code',
  Iban = 'iban',
  Passport = 'passport',
}

const PATTERNS: Record<PiiCategory, RegExp> = {
  [PiiCategory.Password]: /\b(password|passwd|pwd|pin[12]?)\s*[:=]\s*\S{1,64}\b/gi,

  [PiiCategory.CreditCard]: /\b(?:\d[\s-]?){13,19}\b/g,

  [PiiCategory.SSN]: /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g,

  [PiiCategory.Email]: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  [PiiCategory.Phone]: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b/g,

  [PiiCategory.Name]: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,

  [PiiCategory.Address]:
    /\b\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi,

  [PiiCategory.EstonianIdCode]: /\b\d{11}\b(?:\s*[A-Z]{2})?/g,

  [PiiCategory.Iban]:
    /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){2,7}\d{1,4}\b/g,

  [PiiCategory.Passport]:
    /\b([A-Z]{1,2}\d{6,8}|[A-Z]{2}\d{7}|EE\d{8})\b/g,
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

function isValidEstonianIdCode(digits: string): boolean {
  const cleaned = digits.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  const multipliers1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
  const multipliers2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned[i]!, 10) * multipliers1[i]!;
  }
  let check = sum % 11;
  if (check === 10) {
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleaned[i]!, 10) * multipliers2[i]!;
    }
    check = sum % 11;
    if (check === 10) check = 0;
  }
  return check === parseInt(cleaned[10]!, 10);
}

export function filterPii(text: string): FilteredContent {
  let result = text;
  const categories = new Set<PiiCategory>();
  let redactionCount = 0;

  for (const [categoryName, pattern] of Object.entries(PATTERNS)) {
    const category = categoryName as PiiCategory;
    const matches = result.match(pattern);
    if (!matches || matches.length === 0) continue;

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
    } else if (category === PiiCategory.EstonianIdCode) {
      let count = 0;
      result = result.replace(pattern, (match) => {
        if (isValidEstonianIdCode(match)) {
          count++;
          return REDACTED;
        }
        return match;
      });
      if (count > 0) {
        categories.add(PiiCategory.EstonianIdCode);
        redactionCount += count;
      }
    } else {
      categories.add(category);
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
