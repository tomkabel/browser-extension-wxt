import { log } from '~/lib/errors';

interface TlsBindingComponents {
  secFetchSite: string;
  contentHash: string;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function startWebRequestCapture(): void {
  log.info('[TLS] WebRequest capture initialized');
}

export async function getTlsBindingComponents(
  tabId: number,
  controlCode: string,
  pageContent: string,
): Promise<TlsBindingComponents> {
  const contentHash = simpleHash(pageContent || '');

  let secFetchSite = 'cross-site';
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      const tabOrigin = new URL(tab.url).origin;
      const extensionOrigin = chrome.runtime.getURL('/');
      if (tabOrigin === extensionOrigin) {
        secFetchSite = 'same-origin';
      }
    }
  } catch {
    secFetchSite = 'unknown';
  }

  return { secFetchSite, contentHash };
}

export async function buildChallengeProof(
  tabId: number,
  controlCode: string,
  pageContent: string,
): Promise<Uint8Array> {
  const data = new TextEncoder().encode(JSON.stringify({ tabId, controlCode, pageContent }));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}
