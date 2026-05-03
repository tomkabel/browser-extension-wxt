import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/piiFilter', () => ({
  filterDomContent: vi.fn((text: string, opts?: { maxTextLength?: number }) => ({
    text: text.slice(0, opts?.maxTextLength ?? 50000),
    filtered: false,
  })),
}));

vi.mock('./rateLimiter', () => ({
  checkRateLimit: vi.fn(),
  RateLimitResult: { Allowed: 0, RateLimited: 1, Backoff: 2 },
}));

import { checkRateLimit, RateLimitResult } from './rateLimiter';
import { scrapePage, detectLoginForm } from './domScraper';
import { filterDomContent } from '~/lib/piiFilter';

describe('DOM Scraper (7.3, 7.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <h1>Test Page</h1>
      <h2>Section 1</h2>
      <p>This is some content for testing extraction.</p>
      <a href="https://example.com/link1">Link 1</a>
      <a href="https://example.com/link2">Link 2</a>
      <img src="image1.jpg" alt="Image 1" />
      <img src="image2.jpg" alt="Image 2" />
      <form>
        <input type="text" name="username" />
      </form>
    `;
    // jsdom 29 supports innerText, but to be safe, define it
    try {
      Object.defineProperty(document.body, 'innerText', {
        get: () => document.body.textContent ?? '',
        configurable: true,
      });
    } catch {
      // innerText may already be defined
    }
  });

  it('extracts structured content successfully (7.3)', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.Allowed);

    const result = await scrapePage();

    expect(result.success).toBe(true);
    expect(result.text).toBeTruthy();
    expect(result.text).toContain('Test Page');
    expect(result.headings).toHaveLength(2);
    expect(result.headings![0]).toBe('Test Page');
    expect(result.linkCount).toBe(2);
    expect(result.imageCount).toBe(2);
  });

  it('handles rate limited state (7.6)', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.Backoff);

    const result = await scrapePage();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
    expect(result.retryAfterMs).toBe(30000);
  });

  it('handles too many requests state (7.6)', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.RateLimited);

    const result = await scrapePage();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Too many requests, please wait');
    expect(result.retryAfterMs).toBe(60000);
  });

  it('handles empty document body', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.Allowed);
    document.body.innerHTML = '';

    const result = await scrapePage();

    expect(result.success).toBe(true);
    expect(result.text).toBe('');
    expect(result.headings).toHaveLength(0);
    expect(result.linkCount).toBe(0);
    expect(result.imageCount).toBe(0);
  });

  it('applies maxLength truncation (7.7)', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.Allowed);
    document.body.innerHTML = '<p>' + 'a'.repeat(60000) + '</p>';

    const result = await scrapePage();

    expect(result.success).toBe(true);
    expect(result.text!.length).toBeLessThanOrEqual(50000 + 15);
  });

  it('calls PII filter on content', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.Allowed);

    await scrapePage();

    expect(filterDomContent).toHaveBeenCalled();
  });

  it('handles extraction errors gracefully (7.6)', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(RateLimitResult.Allowed);

    const originalBody = document.body;
    Object.defineProperty(document, 'body', {
      get: () => {
        throw new Error('DOM not available');
      },
      configurable: true,
    });

    const result = await scrapePage();

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    Object.defineProperty(document, 'body', {
      value: originalBody,
      configurable: true,
    });
  });
});

describe('detectLoginForm', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects a standard login form with username and password', () => {
    document.body.innerHTML = `
      <form action="/login">
        <input type="text" name="username" id="user" />
        <input type="password" name="password" id="pass" />
        <button type="submit">Login</button>
      </form>
    `;

    const result = detectLoginForm();

    expect(result).not.toBeNull();
    expect(result!.domain).toBeTruthy();
    expect(result!.url).toBeTruthy();
    expect(result!.usernameSelector).toBeTruthy();
    expect(result!.passwordSelector).toBeTruthy();
  });

  it('detects login form with email input instead of text', () => {
    document.body.innerHTML = `
      <form>
        <input type="email" name="email" />
        <input type="password" name="pass" />
      </form>
    `;

    const result = detectLoginForm();

    expect(result).not.toBeNull();
  });

  it('detects login form using autocomplete attributes', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" autocomplete="username" />
        <input type="password" autocomplete="current-password" />
      </form>
    `;

    const result = detectLoginForm();

    expect(result).not.toBeNull();
  });

  it('returns null when no password field exists', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="username" />
        <input type="text" name="email" />
      </form>
    `;

    const result = detectLoginForm();

    expect(result).toBeNull();
  });

  it('returns null when no username field is found near the password field', () => {
    document.body.innerHTML = `
      <form>
        <input type="password" name="password" />
      </form>
    `;

    const result = detectLoginForm();

    expect(result).toBeNull();
  });

  it('detects password field using name attribute pattern', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="login" />
        <input type="text" name="password" id="pwd" />
      </form>
    `;

    const result = detectLoginForm();

    expect(result).not.toBeNull();
    expect(result!.passwordSelector).toBeTruthy();
  });

  it('detects login form with username nearby but not in same form', () => {
    document.body.innerHTML = `
      <div style="position: relative;">
        <input type="text" name="user" style="position: absolute; top: 10px; left: 10px;" />
        <input type="password" name="pass" style="position: absolute; top: 50px; left: 10px;" />
      </div>
    `;

    const result = detectLoginForm();

    expect(result).not.toBeNull();
  });

  it('returns null for empty page', () => {
    document.body.innerHTML = '<div>No forms here</div>';

    const result = detectLoginForm();

    expect(result).toBeNull();
  });
});
