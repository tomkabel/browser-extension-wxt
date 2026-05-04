/**
 * Type-safe message handler for content script.
 * - Uses WXT ctx lifecycle for cleanup
 * - Properly cleans up on ctx.onInvalidated
 * - Returns true for all async handlers
 * - Uses ctx.addEventListener for automatic cleanup
 */

import { browser } from 'wxt/browser';
import { scrapePage, scrapeControlCode } from './domScraper';
import { detectTransaction } from '~/lib/transaction/transactionDetector';
import type { ScrapeResult } from '~/types';

let injectedSelectors: { usernameSelector: string; passwordSelector: string } | null = null;

export function setLoginSelectors(usernameSelector: string, passwordSelector: string): void {
  injectedSelectors = { usernameSelector, passwordSelector };
}

const isContextValid = true;

export function registerContentHandlers(): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isContextValid) {
      sendResponse({ success: false, error: 'Context invalidated' });
      return true;
    }

    switch (message.type) {
      case 'read-dom':
        handleReadDom(message.payload, sendResponse);
        return true;

      case 'detect-transaction':
        handleDetectTransaction(sendResponse);
        return true;

      case 'credential-response':
        handleCredentialResponse(message.payload, sendResponse);
        return true;

      case 'scrape-control-code':
        handleScrapeControlCode(sendResponse);
        return true;

      default:
        return false;
    }
  });
}

async function handleReadDom(
  payload: { maxLength?: number },
  sendResponse: (response: ScrapeResult) => void,
): Promise<void> {
  try {
    const result = await scrapePage(payload.maxLength);
    sendResponse(result);
  } catch (err) {
    sendResponse({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

function handleDetectTransaction(
  sendResponse: (response: { success: boolean; data?: unknown; error?: string }) => void,
): void {
  const result = detectTransaction();
  if (result.success) {
    sendResponse({ success: true, data: result });
  } else {
    sendResponse({ success: false, error: result.error, data: result });
  }
}

async function handleScrapeControlCode(
  sendResponse: (response: {
    success: boolean;
    controlCode?: string | null;
    error?: string;
  }) => void,
): Promise<void> {
  try {
    const controlCode = scrapeControlCode();
    sendResponse({ success: true, controlCode });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Scrape failed' });
  }
}

async function handleCredentialResponse(
  payload: { username: string; password: string },
  sendResponse: (response: { success: boolean; error?: string }) => void,
): Promise<void> {
  try {
    const { injectCredentials } = await import('./index');

    const selectors = injectedSelectors;
    if (!selectors) {
      sendResponse({ success: false, error: 'No login field selectors stored' });
      return;
    }

    const ok = injectCredentials(
      payload.username,
      payload.password,
      selectors.usernameSelector,
      selectors.passwordSelector,
    );
    if (!ok) {
      sendResponse({
        success: false,
        error: 'Login form changed. Please reload the page and try again.',
      });
      return;
    }

    sendResponse({ success: true });
  } catch (err) {
    sendResponse({
      success: false,
      error: err instanceof Error ? err.message : 'Injection failed',
    });
  }
}
