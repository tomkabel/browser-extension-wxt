import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const mockRegisteredScripts: Array<{ id: string }> = [];
const mockRegisterContentScripts = vi.fn();
const mockUnregisterContentScripts = vi.fn();
const mockGetRegisteredContentScripts = vi.fn().mockResolvedValue(mockRegisteredScripts);

vi.stubGlobal('chrome', {
  scripting: {
    registerContentScripts: mockRegisterContentScripts,
    unregisterContentScripts: mockUnregisterContentScripts,
    getRegisteredContentScripts: mockGetRegisteredContentScripts,
  },
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  mockRegisteredScripts.length = 0;
  (fakeBrowser.action as Record<string, unknown>).setBadgeText = vi.fn().mockResolvedValue(
    undefined,
  );
  (fakeBrowser.action as Record<string, unknown>).setBadgeBackgroundColor = vi.fn().mockResolvedValue(
    undefined,
  );
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
    it('registers a script and adds domain to approved list (2.4)', async () => {
      const { registerForDomain, getApprovedDomains } = await import('./contentScriptManager');

      mockRegisterContentScripts.mockResolvedValue(undefined);

      const scriptId = await registerForDomain('example.com');

      expect(scriptId).toContain('credential-fill-');
      expect(scriptId).toHaveLength('credential-fill-'.length + 64);
      expect(mockRegisterContentScripts).toHaveBeenCalledWith(
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

      mockRegisterContentScripts.mockResolvedValue(undefined);

      await registerForDomain('example.com');
      await registerForDomain('example.com');

      const approved = await getApprovedDomains();
      expect(approved).toHaveLength(1);
    });
  });

  describe('unregisterForDomain', () => {
    it('unregisters script and removes domain from approved list (2.5)', async () => {
      const { registerForDomain, unregisterForDomain, getApprovedDomains } =
        await import('./contentScriptManager');

      mockRegisterContentScripts.mockResolvedValue(undefined);
      mockUnregisterContentScripts.mockResolvedValue(undefined);

      await registerForDomain('example.com');
      await unregisterForDomain('example.com');

      expect(mockUnregisterContentScripts).toHaveBeenCalled();
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
    it('addDeniedDomain adds to deny list (4.6)', async () => {
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
