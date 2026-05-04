import { describe, it, expect } from 'vitest';
import { filterPii, filterDomContent, isValidIban, isValidEstonianIdCode, PiiCategory } from './piiFilter';

describe('PII Filter (7.3)', () => {
  describe('filterPii', () => {
    it('redacts email addresses', () => {
      const result = filterPii('Contact me at user@example.com for info');
      expect(result.text).toBe('Contact me at [REDACTED] for info');
      expect(result.hasRedactions).toBe(true);
      expect(result.redactionCount).toBe(1);
    });

    it('redacts phone numbers', () => {
      const result = filterPii('Call me at 555-123-4567');
      expect(result.text).toContain('[REDACTED]');
      expect(result.hasRedactions).toBe(true);
    });

    it('redacts credit card numbers', () => {
      const result = filterPii('Card: 4111 1111 1111 1111');
      expect(result.text).toContain('[REDACTED]');
      expect(result.hasRedactions).toBe(true);
    });

    it('redacts multiple PII patterns', () => {
      const result = filterPii('Email: a@b.com, Phone: 555-123-4567, Card: 4111-1111-1111-1111');
      expect(result.hasRedactions).toBe(true);
      expect(result.redactionCount).toBeGreaterThanOrEqual(3);
    });

    it('returns clean text unchanged', () => {
      const result = filterPii('This is just normal text without any PII.');
      expect(result.text).toBe('This is just normal text without any PII.');
      expect(result.hasRedactions).toBe(false);
      expect(result.redactionCount).toBe(0);
    });

    it('identifies categories of redacted content', () => {
      const result = filterPii('Email: user@test.com');
      expect(result.categories.size).toBeGreaterThan(0);
    });
  });

  describe('isValidIban', () => {
  it('returns true for valid DE IBAN', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });

  it('returns true for valid GB IBAN', () => {
    expect(isValidIban('GB29NWBK60161331926819')).toBe(true);
  });

  it('returns true for valid EE IBAN', () => {
    expect(isValidIban('EE471000001020145685')).toBe(true);
  });

  it('returns false for IBAN with bad checksum', () => {
    expect(isValidIban('DE89370400440532013001')).toBe(false);
  });

  it('returns false for too-short string', () => {
    expect(isValidIban('DE12')).toBe(false);
  });

  it('tolerates lowercase input', () => {
    expect(isValidIban('de89370400440532013000')).toBe(true);
  });
});

describe('isValidEstonianIdCode', () => {
  it('returns true for a valid Estonian ID code', () => {
    expect(isValidEstonianIdCode('38705264215')).toBe(true);
  });

  it('returns false for invalid check digit', () => {
    expect(isValidEstonianIdCode('38705264210')).toBe(false);
  });

  it('returns false for wrong length', () => {
    expect(isValidEstonianIdCode('1234567890')).toBe(false);
  });

  it('returns false for non-digit input', () => {
    expect(isValidEstonianIdCode('abc')).toBe(false);
  });
});

describe('PII redaction — IBAN', () => {
  it('redacts valid IBAN in text', () => {
    const result = filterPii('IBAN: DE89370400440532013000');
    expect(result.text).toContain('[REDACTED]');
    expect(result.categories.has(PiiCategory.Iban)).toBe(true);
  });

  it('does not redact invalid IBAN', () => {
    const result = filterPii('IBAN: DE89370400440532013001');
    expect(result.text).not.toContain('[REDACTED]');
    expect(result.categories.has(PiiCategory.Iban)).toBe(false);
  });
});

describe('PII redaction — passport', () => {
  it('redacts passport pattern', () => {
    const result = filterPii('Passport: AB123456');
    expect(result.text).toContain('[REDACTED]');
    expect(result.categories.has(PiiCategory.Passport)).toBe(true);
  });
});

describe('PII redaction — password edge cases', () => {
  it('redacts password value ending with punctuation', () => {
    const result = filterPii('password=abc!');
    expect(result.text).toContain('[REDACTED]');
    expect(result.categories.has(PiiCategory.Password)).toBe(true);
  });

  it('redacts password value ending with special chars', () => {
    const result = filterPii('pwd=test@123#');
    expect(result.text).toContain('[REDACTED]');
  });

  it('redacts 64-char password value', () => {
    const pwd = 'a'.repeat(64);
    const result = filterPii(`password=${pwd}`);
    expect(result.text).toContain('[REDACTED]');
  });

  it('does not redact password value exceeding 64 chars', () => {
    const pwd = 'a'.repeat(65);
    const result = filterPii(`password=${pwd}`);
    expect(result.text).not.toContain('[REDACTED]');
  });

  it('redacts pin1 and pin2 variants', () => {
    expect(filterPii('pin1=1234').text).toContain('[REDACTED]');
    expect(filterPii('pin2=5678').text).toContain('[REDACTED]');
  });
});

describe('filterDomContent', () => {
    it('applies max length truncation', () => {
      const longText = 'a'.repeat(100);
      const result = filterDomContent(longText, { maxTextLength: 10 });
      expect(result.text.length).toBeLessThanOrEqual(25); // 10 + truncation suffix
      expect(result.text).toContain('[truncated]');
    });

    it('returns filtered flag when PII present', () => {
      const result = filterDomContent('Email: a@b.com');
      expect(result.filtered).toBe(true);
    });

    it('returns filtered=false when no PII', () => {
      const result = filterDomContent('clean text');
      expect(result.filtered).toBe(false);
    });
  });
});
