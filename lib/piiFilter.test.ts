import { describe, it, expect } from 'vitest';
import { filterPii, filterDomContent } from './piiFilter';

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
