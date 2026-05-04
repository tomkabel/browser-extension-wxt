import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';

interface SecFetchHeaders {
  site: string;
  mode: string;
  dest: string;
  user: string;
}

const tabSecFetchCache = new Map<number, SecFetchHeaders>();

function computeContentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', data).then((hash) => {
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  });
}

export function startWebRequestCapture(): void {
  if (!browser.webRequest?.onBeforeSendHeaders) {
    log.warn('[tlsBinding] webRequest API unavailable');
    return;
  }

  try {
    browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (details.type !== 'main_frame' || !details.tabId) return undefined;
        const headers: Record<string, string> = {};
        for (const h of details.requestHeaders ?? []) {
          const key = h.name.toLowerCase();
          if (key.startsWith('sec-fetch-')) {
            headers[key] = h.value ?? '';
          }
        }
        if (headers['sec-fetch-site']) {
          tabSecFetchCache.set(details.tabId, {
            site: headers['sec-fetch-site'] ?? '',
            mode: headers['sec-fetch-mode'] ?? '',
            dest: headers['sec-fetch-dest'] ?? '',
            user: headers['sec-fetch-user'] ?? '',
          });
        }
        return undefined;
      },
      { urls: ['*://*/*'], types: ['main_frame'] },
      ['requestHeaders', 'extraHeaders'],
    );

    browser.tabs.onRemoved.addListener((tabId: number) => {
      tabSecFetchCache.delete(tabId);
    });

    log.info('[tlsBinding] WebRequest capture started');
  } catch (err) {
    log.error('[tlsBinding] Failed to start WebRequest capture:', err);
  }
}

export async function buildChallengeProof(
  tabId: number,
  controlCode: string,
  pageContent: string,
  precomputedHash?: string,
): Promise<Uint8Array> {
  const secFetch = tabSecFetchCache.get(tabId) ?? {
    site: 'cross-site',
    mode: 'navigate',
    dest: 'document',
    user: '?1',
  };
  const contentHash = precomputedHash ?? await computeContentHash(pageContent);

  const encoder = new TextEncoder();
  const proofPayload = {
    version: 1,
    secFetchSite: secFetch.site,
    secFetchMode: secFetch.mode,
    secFetchDest: secFetch.dest,
    secFetchUser: secFetch.user,
    contentHash,
    controlCode,
    timestamp: Date.now(),
  };

  const serialized = encoder.encode(JSON.stringify(proofPayload));
  const hash = await crypto.subtle.digest('SHA-256', serialized);
  return new Uint8Array(hash);
}

export interface TlsBindingComponents {
  secFetchSite: string;
  contentHash: string;
  tlsBindingHash: Uint8Array;
}

export async function getTlsBindingComponents(
  tabId: number,
  controlCode: string,
  pageContent: string,
): Promise<TlsBindingComponents> {
  const secFetch = tabSecFetchCache.get(tabId) ?? { site: 'cross-site', mode: 'navigate', dest: 'document', user: '?1' };
  const contentHash = await computeContentHash(pageContent);
  const binding = await buildChallengeProof(tabId, controlCode, pageContent, contentHash);

  return {
    secFetchSite: secFetch.site,
    contentHash,
    tlsBindingHash: binding,
  };
}
