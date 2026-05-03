/**
 * Content script entry with proper WXT lifecycle cleanup.
 * - Uses ctx.addEventListener for automatic cleanup on wxt:locationchange
 * - Uses ctx.onInvalidated for context invalidation handling
 * - Rate limiter cleanup interval is properly managed
 * - Uses document_idle for timing (not document_end)
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { registerContentHandlers } from './contentMessageBus';
import { startCleanupInterval, stopCleanupInterval } from './rateLimiter';
import { detectLoginForm } from './domScraper';
import { detectTransaction } from '~/lib/transaction/transactionDetector';
import { log } from '~/lib/errors';

let loginFormEmitted = false;
let loginDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;

function emitLoginForm(): void {
  const detection = detectLoginForm();
  if (!detection) return;

  log.info('[Content] Login form detected:', detection.domain);
  loginFormEmitted = true;

  browser.runtime
    .sendMessage({
      type: 'detect-login-form',
      payload: detection,
    })
    .catch(() => {});
}

function scheduleLoginDetection(): void {
  if (loginDebounceTimer) clearTimeout(loginDebounceTimer);
  loginDebounceTimer = setTimeout(emitLoginForm, 500);
}

function startMutationObserver(): void {
  observer = new MutationObserver((mutations) => {
    if (loginFormEmitted) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.querySelector?.('input[type="password"]') || node.matches?.('input[type="password"]')) {
            scheduleLoginDetection();
            return;
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopMutationObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (loginDebounceTimer) {
    clearTimeout(loginDebounceTimer);
    loginDebounceTimer = null;
  }
}

export function injectCredentials(username: string, password: string, usernameSelector: string, passwordSelector: string): boolean {
  const usernameField = document.querySelector(usernameSelector) as HTMLInputElement | null;
  const passwordField = document.querySelector(passwordSelector) as HTMLInputElement | null;

  if (!usernameField || !passwordField) return false;

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(usernameField, username);
    nativeSetter.call(passwordField, password);
  } else {
    usernameField.value = username;
    passwordField.value = password;
  }

  usernameField.dispatchEvent(new Event('input', { bubbles: true }));
  usernameField.dispatchEvent(new Event('change', { bubbles: true }));
  passwordField.dispatchEvent(new Event('input', { bubbles: true }));
  passwordField.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

export default defineContentScript({
  matches: ['*://*.lhv.ee/*', '*://*.youtube.tomabel.ee/*'],
  runAt: 'document_idle',

  main(ctx) {
    log.info('[Content] Script starting');

    registerContentHandlers();
    startCleanupInterval();

    function reportTransaction() {
      const result = detectTransaction();
      if (result.success && result.transaction) {
        browser.runtime
          .sendMessage({
            type: 'detect-transaction',
            payload: result.transaction,
          })
          .catch(() => {});
      }
    }

    browser.runtime
      .sendMessage({
        type: 'tab-domain-changed',
        payload: {
          domain: window.location.hostname,
          url: window.location.href,
        },
      })
      .catch(() => {});

    setTimeout(reportTransaction, 1000);
    setTimeout(() => {
      if (!loginFormEmitted) emitLoginForm();
    }, 1500);

    startMutationObserver();

    let lastUrl = window.location.href;

    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      const newUrlStr = newUrl instanceof URL ? newUrl.href : newUrl;
      if (newUrlStr !== lastUrl) {
        lastUrl = newUrlStr;
        loginFormEmitted = false;
        const url = new URL(newUrlStr);
        browser.runtime
          .sendMessage({
            type: 'tab-domain-changed',
            payload: {
              domain: url.hostname,
              url: newUrlStr,
            },
          })
          .catch(() => {});
        setTimeout(reportTransaction, 1000);
        setTimeout(() => {
          if (!loginFormEmitted) emitLoginForm();
        }, 1500);
      }
    });

    ctx.onInvalidated(() => {
      log.info('[Content] Context invalidated, cleaning up');
      stopCleanupInterval();
      stopMutationObserver();
    });

    log.info('[Content] Script initialized');
  },
});
