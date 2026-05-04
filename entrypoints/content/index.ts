import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { registerContentHandlers } from './contentMessageBus';
import { startCleanupInterval, stopCleanupInterval } from './rateLimiter';
import { detectLoginForm } from './domScraper';
import { detectTransaction } from '~/lib/transaction/transactionDetector';
import { loadCached } from '~/lib/transaction/remoteRegistry';
import { log } from '~/lib/errors';
import { parseDomain } from '~/lib/domainParser';

let loginFormEmitted = false;
let loginDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let contentInitDone = false;
let checkedApproval = false;
let isApprovedDomain = false;

async function checkDynamicApproval(domain: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const result = await Promise.race([
      browser.runtime.sendMessage({
        type: 'check-domain-approved',
        payload: { domain },
      }),
      new Promise<undefined>((_, reject) =>
        setTimeout(() => reject(new Error('Approval check timed out')), timeoutMs),
      ),
    ]);
    const data = result as { success?: boolean; data?: { approved?: boolean } } | undefined;
    return !!data?.data?.approved;
  } catch {
    return false;
  }
}

function emitLoginForm(): void {
  const detection = detectLoginForm();
  if (!detection) return;

  loginFormEmitted = true;

  if (isApprovedDomain) {
    log.info('[Content] Login form detected on approved domain:', detection.domain);
    browser.runtime
      .sendMessage({
        type: 'detect-login-form',
        payload: detection,
      })
      .catch(() => {});
    return;
  }

  browser.runtime
    .sendMessage({
      type: 'login-form-detected-unapproved',
      payload: detection,
    })
    .catch(() => {});
}

function scheduleLoginDetection(): void {
  if (loginDebounceTimer) clearTimeout(loginDebounceTimer);
  loginDebounceTimer = setTimeout(() => {
    if (!checkedApproval) return;
    emitLoginForm();
  }, 500);
}

function startMutationObserver(): void {
  observer = new MutationObserver((mutations) => {
    if (loginFormEmitted) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (
            node.querySelector?.('input[type="password"]') ||
            node.matches?.('input[type="password"]')
          ) {
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

function reportDomainTransaction(): void {
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

export function injectCredentials(
  username: string,
  password: string,
  usernameSelector: string,
  passwordSelector: string,
): boolean {
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
  matches: ['*://*/*'],
  runAt: 'document_idle',
  excludeMatches: [
    '*://*.google.com/*',
    '*://*.github.com/*',
    '*://*.stackoverflow.com/*',
    '*://*.youtube.com/*',
    '*://localhost:*/*',
    '*://127.0.0.1:*/*',
  ],

  main(ctx) {
    if (contentInitDone) return;
    contentInitDone = true;

    const hostname = window.location.hostname;
    const parsed = parseDomain(window.location.href);
    const registrableDomain = parsed.success ? parsed.data.registrableDomain : hostname;

    registerContentHandlers();
    startCleanupInterval();

    if (['lhv.ee', 'www.lhv.ee', 'youtube.tomabel.ee'].includes(hostname)) {
      loadCached().catch(() => {});
    }

    browser.runtime
      .sendMessage({
        type: 'tab-domain-changed',
        payload: {
          domain: hostname,
          url: window.location.href,
        },
      })
      .catch(() => {});

    checkDynamicApproval(registrableDomain).then((approved) => {
      checkedApproval = true;
      isApprovedDomain = approved;
      log.info('[Content] Domain:', hostname, approved ? '(approved)' : '(unapproved)');

      if (approved) {
        setTimeout(reportDomainTransaction, 1000);
      }

      setTimeout(() => {
        if (!loginFormEmitted) emitLoginForm();
      }, 1500);
    });

    setTimeout(() => {
      if (checkedApproval) return;
      isApprovedDomain = false;
      checkedApproval = true;
      if (!loginFormEmitted) emitLoginForm();
    }, 2000);

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
        const newParsed = parseDomain(newUrlStr);
        const newRegistrableDomain = newParsed.success
          ? newParsed.data.registrableDomain
          : url.hostname;
        checkedApproval = false;
        checkDynamicApproval(newRegistrableDomain).then((approved) => {
          checkedApproval = true;
          isApprovedDomain = approved;
          if (approved) {
            setTimeout(reportDomainTransaction, 1000);
          }
          setTimeout(() => {
            if (!loginFormEmitted) emitLoginForm();
          }, 1500);
        });
      }
    });

    ctx.onInvalidated(() => {
      log.info('[Content] Context invalidated, cleaning up');
      stopCleanupInterval();
      stopMutationObserver();
      contentInitDone = false;
    });

    log.info('[Content] Script initialized');
  },
});
