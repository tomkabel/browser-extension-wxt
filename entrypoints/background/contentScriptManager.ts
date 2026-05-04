import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';
import type { ApprovedDomain } from '~/types';

const STORAGE_KEY = 'approvedDomains';
const SCRIPT_ID_PREFIX = 'credential-fill-';

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function scriptIdForDomain(domain: string, hash?: string): string {
  return `${SCRIPT_ID_PREFIX}${hash ?? domain}`;
}

export async function registerForDomain(domain: string): Promise<string> {
  const hash = await sha256Hex(domain);
  const scriptId = scriptIdForDomain(domain, hash);

  const existing = await getApprovedDomains();
  if (existing.some((a) => a.domain === domain)) {
    log.info('[CSM] Domain already approved:', domain);
    return scriptId;
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: scriptId,
        matches: [`*://*.${domain}/*`],
        js: ['content-scripts/content.js'],
        runAt: 'document_end',
        persistAcrossSessions: true,
        world: 'ISOLATED',
      },
    ]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already registered')) {
      log.info('[CSM] Script already registered:', domain);
    } else {
      log.error('[CSM] Failed to register script for', domain, err);
      throw err;
    }
  }

  const entry: ApprovedDomain = { domain, registeredAt: Date.now(), scriptId };
  const updated = [...existing, entry];
  await browser.storage.sync.set({ [STORAGE_KEY]: updated });

  log.info('[CSM] Registered domain:', domain);
  return scriptId;
}

export async function unregisterForDomain(domain: string): Promise<void> {
  const existing = await getApprovedDomains();
  const entry = existing.find((a) => a.domain === domain);
  if (!entry) {
    log.info('[CSM] Domain not found in approved list:', domain);
    return;
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [entry.scriptId] });
  } catch (err) {
    log.warn('[CSM] Failed to unregister script for', domain, err);
  }

  const updated = existing.filter((a) => a.domain !== domain);
  await browser.storage.sync.set({ [STORAGE_KEY]: updated });

  log.info('[CSM] Unregistered domain:', domain);
}

export async function getApprovedDomains(): Promise<ApprovedDomain[]> {
  const stored = await browser.storage.sync.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] ?? []) as ApprovedDomain[];
}

export async function isDomainApproved(domain: string): Promise<boolean> {
  const domains = await getApprovedDomains();
  return domains.some((a) => a.domain === domain);
}

export async function reRegisterOnStartup(): Promise<void> {
  const domains = await getApprovedDomains();
  if (domains.length === 0) return;

  log.info('[CSM] Re-registering', domains.length, 'approved domains on startup');

  let registeredScripts: chrome.scripting.RegisteredContentScript[] = [];
  try {
    registeredScripts = await chrome.scripting.getRegisteredContentScripts();
  } catch {
    log.warn('[CSM] Failed to get registered scripts, will attempt registration');
  }

  for (const entry of domains) {
    try {
      const alreadyRegistered = registeredScripts.some((s) => s.id === entry.scriptId);
      if (alreadyRegistered) continue;

      await chrome.scripting.registerContentScripts([
        {
          id: entry.scriptId,
          matches: [`*://*.${entry.domain}/*`],
          js: ['content-scripts/content.js'],
          runAt: 'document_end',
          persistAcrossSessions: true,
          world: 'ISOLATED',
        },
      ]);
    } catch (err) {
      log.warn('[CSM] Failed to re-register script for', entry.domain, err);
    }
  }
}

const PENDING_KEY = 'pendingDomains';
const DENIED_SESSION_KEY = 'deniedDomains';

export async function addPendingDomain(
  domain: string,
  url: string,
  tabId: number,
  formSelectors: { usernameSelector: string; passwordSelector: string },
): Promise<void> {
  const stored = (await browser.storage.session.get(PENDING_KEY)) as Record<string, unknown>;
  const pending = (stored[PENDING_KEY] ?? []) as Array<{
    domain: string;
    url: string;
    tabId: number;
    usernameSelector: string;
    passwordSelector: string;
    timestamp: number;
  }>;

  if (pending.some((p) => p.domain === domain)) return;

  pending.push({ domain, url, tabId, ...formSelectors, timestamp: Date.now() });
  await browser.storage.session.set({ [PENDING_KEY]: pending });
  await updateBadgeCount();
}

export async function getPendingDomains(): Promise<
  Array<{
    domain: string;
    url: string;
    tabId: number;
    usernameSelector: string;
    passwordSelector: string;
  }>
> {
  const stored = (await browser.storage.session.get(PENDING_KEY)) as Record<string, unknown>;
  return (stored[PENDING_KEY] ?? []) as Array<{
    domain: string;
    url: string;
    tabId: number;
    usernameSelector: string;
    passwordSelector: string;
  }>;
}

export async function removePendingDomain(domain: string): Promise<void> {
  const stored = (await browser.storage.session.get(PENDING_KEY)) as Record<string, unknown>;
  const pending = (stored[PENDING_KEY] ?? []) as Array<{ domain: string }>;
  const updated = pending.filter((p) => p.domain !== domain);
  await browser.storage.session.set({ [PENDING_KEY]: updated });
  await updateBadgeCount();
}

export async function updateBadgeCount(): Promise<void> {
  const pending = await getPendingDomains();
  const count = pending.length;
  if (count > 0) {
    await browser.action.setBadgeText({ text: String(count) });
    await browser.action.setBadgeBackgroundColor({ color: '#dc2626' });
  } else {
    await browser.action.setBadgeText({ text: '' });
  }
}

export async function isDomainDeniedInSession(domain: string): Promise<boolean> {
  const stored = (await browser.storage.session.get(DENIED_SESSION_KEY)) as Record<string, unknown>;
  const denied = (stored[DENIED_SESSION_KEY] ?? []) as string[];
  return denied.includes(domain);
}

export async function addDeniedDomain(domain: string): Promise<void> {
  const stored = (await browser.storage.session.get(DENIED_SESSION_KEY)) as Record<string, unknown>;
  const denied = (stored[DENIED_SESSION_KEY] ?? []) as string[];
  if (!denied.includes(domain)) {
    denied.push(domain);
    await browser.storage.session.set({ [DENIED_SESSION_KEY]: denied });
  }
}
