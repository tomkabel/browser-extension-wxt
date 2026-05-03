/**
 * Manages ephemeral tab state with deduplication.
 * - Prevents duplicate domain updates
 * - Validates URLs before storage
 * - Cleans up on tab close
 */

import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { parseDomain } from '~/lib/domainParser';
import { log } from '~/lib/errors';

export interface TabDomainState {
  tabId: number;
  domain: string;
  registrableDomain: string;
  url: string;
  timestamp: number;
  isPublic: boolean;
}

function getTabStorageKey(tabId: number): `session:${number}:domain` {
  return `session:${tabId}:domain`;
}

const lastUpdateCache = new Map<number, { domain: string; timestamp: number }>();
const CACHE_TTL_MS = 1000;

function setupTabCloseListener(): void {
  browser.tabs.onRemoved.addListener((tabId) => {
    lastUpdateCache.delete(tabId);
    log.debug(`[TabState] Cleaned up cache for tab ${tabId}`);
  });
}

let isListenerInitialized = false;

function ensureTabCloseListener(): void {
  if (!isListenerInitialized) {
    setupTabCloseListener();
    isListenerInitialized = true;
  }
}

export const TabStateManager = {
  async updateTabDomain(tabId: number, url: string): Promise<boolean> {
    const parsed = parseDomain(url);

    if (!parsed.success) {
      log.debug(`Skipping invalid URL for tab ${tabId}:`, parsed.error);
      return false;
    }

    const cached = lastUpdateCache.get(tabId);
    const now = Date.now();
    if (cached && cached.domain === parsed.data.domain && now - cached.timestamp < CACHE_TTL_MS) {
      return false;
    }

    const state: TabDomainState = {
      tabId,
      domain: parsed.data.domain,
      registrableDomain: parsed.data.registrableDomain,
      url,
      timestamp: now,
      isPublic: parsed.data.isPublic,
    };

    const key = getTabStorageKey(tabId);
    await storage.setItem(key, state);

    lastUpdateCache.set(tabId, { domain: parsed.data.domain, timestamp: now });

    log.debug(`Updated domain for tab ${tabId}:`, parsed.data.domain);
    return true;
  },

  async getTabDomain(tabId: number): Promise<TabDomainState | null> {
    const cached = lastUpdateCache.get(tabId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      const key = getTabStorageKey(tabId);
      const state = await storage.getItem<TabDomainState | null>(key);
      if (state) {
        return state;
      }
    }

    const key = getTabStorageKey(tabId);
    const state = await storage.getItem<TabDomainState | null>(key);
    return state ?? null;
  },

  async clearTabState(tabId: number): Promise<void> {
    const key = getTabStorageKey(tabId);
    await storage.removeItem(key);
    lastUpdateCache.delete(tabId);
    log.debug(`Cleared state for tab ${tabId}`);
  },

  async clearAllStates(): Promise<void> {
    lastUpdateCache.clear();
  },

  init(): void {
    ensureTabCloseListener();
  },
};

TabStateManager.init();
