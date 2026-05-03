/**
 * Secure DOM content scraper.
 * - Always runs PII filter before returning
 * - Respects rate limits
 * - Returns structured data only
 * - Content script uses document.location directly (not tabs.query)
 */

import { filterDomContent } from '~/lib/piiFilter';
import { checkRateLimit, RateLimitResult } from './rateLimiter';
import type { ScrapeResult, StructuredContent, LoginFormDetection } from '~/types';

export async function scrapePage(maxLength = 50000): Promise<ScrapeResult> {
  // Content script is already running in its own tab - use document.location directly
  // Do NOT use tabs.query - it requires tabs permission and adds race condition
  const currentUrl = document.location.href;
  if (!currentUrl) {
    return { success: false, error: 'Could not determine document URL' };
  }

  // Rate limit check - content script instance only runs in one tab
  // Use window.location.href as key (content scripts are per-tab)
  const rateLimitCheck = checkRateLimit();
  if (rateLimitCheck === RateLimitResult.Backoff) {
    return {
      success: false,
      error: 'Rate limited',
      retryAfterMs: 30000,
    };
  }
  if (rateLimitCheck === RateLimitResult.RateLimited) {
    return {
      success: false,
      error: 'Too many requests, please wait',
      retryAfterMs: 60000,
    };
  }

  try {
    const structured = extractStructuredContent();

    const { text: filteredText, filtered } = filterDomContent(structured.textContent, {
      maxTextLength: maxLength,
    });

    return {
      success: true,
      text: filteredText,
      headings: structured.headings,
      linkCount: structured.links.length,
      imageCount: structured.imageCount,
      filtered,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Scrape failed',
    };
  }
}

function extractStructuredContent(): StructuredContent {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map((h) => h.textContent?.trim() ?? '')
    .filter(Boolean)
    .slice(0, 50);

  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => ({
      text: a.textContent?.trim() ?? '',
      href: (a as HTMLAnchorElement).href,
    }))
    .filter((l) => l.href.startsWith('http'))
    .slice(0, 100);

  const formCount = document.querySelectorAll('form').length;
  const imageCount = document.querySelectorAll('img').length;
  const textContent = document.body?.innerText ?? '';

  return {
    headings,
    links,
    formCount,
    imageCount,
    textContent,
  };
}

export function detectLoginForm(): LoginFormDetection | null {
  const passwordSelectors = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[name*="password" i]',
  ];

  let passwordField: HTMLInputElement | null = null;

  for (const selector of passwordSelectors) {
    passwordField = document.querySelector(selector);
    if (passwordField) break;
  }

  if (!passwordField) return null;

  let usernameField: HTMLInputElement | null = null;

  const form = passwordField.closest('form');
  if (form) {
    usernameField = form.querySelector(
      'input[type="text"], input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i]',
    );
  }

  if (!usernameField) {
    const allInputs = Array.from(
      document.querySelectorAll('input[type="text"], input[type="email"]'),
    ) as HTMLInputElement[];
    usernameField =
      allInputs.find((input) => {
        const inputRect = input.getBoundingClientRect();
        const pwRect = passwordField!.getBoundingClientRect();
        return (
          inputRect.top <= pwRect.bottom + 100 &&
          inputRect.bottom >= pwRect.top - 100 &&
          Math.abs(inputRect.left - pwRect.left) < 300
        );
      }) ?? null;
  }

  if (!usernameField) return null;

  function buildSelector(element: HTMLElement | null): string {
    if (!element) return '';
    if (element.id) return `#${CSS.escape(element.id)}`;
    const inputEl = element as HTMLInputElement;
    if (inputEl.name) return `[name="${CSS.escape(inputEl.name)}"]`;
    const classes = Array.from(element.classList)
      .slice(0, 2)
      .map((c) => `.${CSS.escape(c)}`)
      .join('');
    if (classes) return `${element.tagName.toLowerCase()}${classes}`;
    return element.tagName.toLowerCase();
  }

  return {
    domain: document.location.hostname,
    url: document.location.href,
    usernameSelector: buildSelector(usernameField),
    passwordSelector: buildSelector(passwordField),
    formAction: (form as HTMLFormElement | null)?.action || document.location.href,
  };
}
