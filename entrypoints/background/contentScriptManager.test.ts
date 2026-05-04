import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const mockStorage = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      sync: {
        get: vi.fn(async (key: string) => {
          const val = mockStorage.get(key);
          return val ? { [key]: val } : {};
        }),
        set: vi.fn(async (entries: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(entries)) {
            mockStorage.set(k, v);
          }
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys];
          for (const k of ks) mockStorage.delete(k);
        }),
      },
      session: {
        get: vi.fn(async (key: string) => {
          const val = mockStorage.get(key);
          return val ? { [key]: val } : {};
        }),
        set: vi.fn(async (entries: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(entries)) {
            mockStorage.set(k, v);
          }
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys];
          for (const k of ks) mockStorage.delete(k);
        }),
      },
    },
  },
}));

const mockRegisteredScripts: Array<{ id: string }> = [];

vi.stubGlobal('chrome', {
  runtime: { id: 'test-extension-id' },
  scripting: {
    registerContentScripts: vi.fn(),
    unregisterContentScripts: vi.fn(),
    getRegisteredContentScripts: vi.fn().mockResolvedValue(mockRegisteredScripts),
  },
});

beforeEach(() => {
  mockStorage.clear();
  vi.clearAllMocks();
  mockRegisteredScripts.length = 0;
});

describe('contentScriptManager', () => {
  describe('sha256Hex', () => {
    it('produces a consistent hex hash', async () => {
      const { sha256Hex } = await import('./contentScriptManager');
      const hash1 = await sha256Hex('example.com');
      const hash2 = await sha256Hex('example.com');
      const hash3 = await sha256Hex('other.com');
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('registerForDomain', () => {
    it('registers a script and adds domain to approved list', async () => {
      const { registerForDomain, getApprovedDomains } = await import('./contentScriptManager');

      const scriptId = await registerForDomain('example.com');

      expect(scriptId).toContain('credential-fill-');
      expect(scriptId).toHaveLength('credential-fill-'.length + 64);
      expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: scriptId,
            matches: ['*://*.example.com/*'],
            runAt: 'document_end',
            persistAcrossSessions: true,
          }),
        ]),
      );

      const approved = await getApprovedDomains();
      expect(approved).toHaveLength(1);
      expect(approved[0]?.domain).toBe('example.com');
      expect(approved[0]?.scriptId).toBe(scriptId);
    });

    it('is idempotent for already approved domains', async () => {
      const { registerForDomain, getApprovedDomains } = await import('./contentScriptManager');

      const callCountBeforeFirst = (chrome.scripting.registerContentScripts as any).mock.calls.length;
      await registerForDomain('example.com');
      const callCountAfterFirst = (chrome.scripting.registerContentScripts as any).mock.calls.length;
      await registerForDomain('example.com');
      const callCountAfterSecond = (chrome.scripting.registerContentScripts as any).mock.calls.length;

      const approved = await getApprovedDomains();
      expect(approved).toHaveLength(1);
      expect(callCountAfterSecond).toBe(callCountAfterFirst);
      expect(callCountAfterFirst).toBeGreaterThan(callCountBeforeFirst);
    });
  });

  describe('unregisterForDomain', () => {
    it('unregisters script and removes domain from approved list', async () => {
      const { registerForDomain, unregisterForDomain, getApprovedDomains } =
        await import('./contentScriptManager');

      const scriptId = await registerForDomain('example.com');
      await unregisterForDomain('example.com');

      expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith(
        expect.objectContaining({ ids: [scriptId] }),
      );
      const approved = await getApprovedDomains();
      expect(approved).toHaveLength(0);
    });
  });

  describe('pending domains', () => {
    it('addPendingDomain adds domain and updates badge', async () => {
      const { addPendingDomain, getPendingDomains } = await import('./contentScriptManager');

      await addPendingDomain('example.com', 'https://example.com/login', 1, {
        usernameSelector: '#username',
        passwordSelector: '#password',
      });

      const pending = await getPendingDomains();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.domain).toBe('example.com');
    });

    it('does not add duplicate pending domains', async () => {
      const { addPendingDomain, getPendingDomains } = await import('./contentScriptManager');

      await addPendingDomain('example.com', 'https://example.com/login', 1, {
        usernameSelector: '#username',
        passwordSelector: '#password',
      });
      await addPendingDomain('example.com', 'https://example.com/other', 1, {
        usernameSelector: '#username',
        passwordSelector: '#password',
      });

      const pending = await getPendingDomains();
      expect(pending).toHaveLength(1);
    });

    it('removePendingDomain removes domain from pending', async () => {
      const { addPendingDomain, removePendingDomain, getPendingDomains } =
        await import('./contentScriptManager');

      await addPendingDomain('example.com', 'https://example.com/login', 1, {
        usernameSelector: '#username',
        passwordSelector: '#password',
      });
      await removePendingDomain('example.com');

      const pending = await getPendingDomains();
      expect(pending).toHaveLength(0);
    });
  });

  describe('session deny list', () => {
    it('addDeniedDomain adds to deny list', async () => {
      const { addDeniedDomain, isDomainDeniedInSession } = await import('./contentScriptManager');

      await addDeniedDomain('example.com');
      const denied = await isDomainDeniedInSession('example.com');
      expect(denied).toBe(true);
    });

    it('non-denied domain returns false', async () => {
      const { isDomainDeniedInSession } = await import('./contentScriptManager');
      const denied = await isDomainDeniedInSession('not-denied.com');
      expect(denied).toBe(false);
    });
  });
});
