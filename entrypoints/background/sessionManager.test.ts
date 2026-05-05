import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const SESSION_STORAGE_KEY = 'mfa:session';
const SESSION_PERSISTED_KEY = 'mfa:session:persisted';
const PRF_AVAILABLE_KEY = 'prf:available';
const PRF_SALT_KEY = 'prf:salt';

let sessionManager: typeof import('./sessionManager');

async function reloadModule() {
  vi.resetModules();
  sessionManager = await import('./sessionManager');
}

function ensureCredentialsMock() {
  if (!navigator.credentials) {
    Object.defineProperty(navigator, 'credentials', {
      value: {
        create: vi.fn(),
        get: vi.fn(),
      },
      configurable: true,
    });
  }
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetModules();
  ensureCredentialsMock();
  vi.spyOn(navigator.credentials, 'create').mockRejectedValue(new Error('not mocked'));
  vi.spyOn(navigator.credentials, 'get').mockRejectedValue(new Error('not mocked'));
  sessionManager = await import('./sessionManager');
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mockPrfAvailable(available: boolean): Promise<void> {
  await fakeBrowser.storage.session.set({ [PRF_AVAILABLE_KEY]: available });
}

async function setPrfSaltInSession(salt: Uint8Array): Promise<void> {
  const saltB64 = btoa(String.fromCharCode(...Array.from(salt)));
  await fakeBrowser.storage.session.set({ [PRF_SALT_KEY]: saltB64 });
}

function mockPrfAssertionFails(): void {
  vi.spyOn(navigator.credentials, 'get').mockRejectedValue(new Error('NotAllowedError'));
}

function createSession() {
  return {
    sessionToken: 'abc123',
    mfaVerifiedAt: Date.now(),
    expiry: Date.now() + 300000,
    deviceName: 'Test Device',
    persistedAt: Date.now(),
  };
}

describe('sessionManager - activateSession', () => {
  it('writes to session storage always', async () => {
    await sessionManager.activateSession('Test Device');

    const sessionResult = await fakeBrowser.storage.session.get(SESSION_STORAGE_KEY);
    expect(sessionResult[SESSION_STORAGE_KEY]).toBeTruthy();
  });

  it('does NOT write to local storage when PRF is available', async () => {
    await reloadModule();
    await mockPrfAvailable(true);

    await sessionManager.activateSession('Test Device');

    const localResult = await fakeBrowser.storage.local.get(SESSION_PERSISTED_KEY);
    expect(localResult[SESSION_PERSISTED_KEY]).toBeUndefined();
  });

  it('writes to local storage when PRF is NOT available (PIN fallback)', async () => {
    await reloadModule();
    await mockPrfAvailable(false);

    await sessionManager.activateSession('Test Device');

    const localResult = await fakeBrowser.storage.local.get(SESSION_PERSISTED_KEY);
    expect(localResult[SESSION_PERSISTED_KEY]).toBeTruthy();
  });
});

describe('sessionManager - clearSession', () => {
  it('removes session from both stores', async () => {
    const session = createSession();
    await fakeBrowser.storage.session.set({ [SESSION_STORAGE_KEY]: session });
    await fakeBrowser.storage.local.set({ [SESSION_PERSISTED_KEY]: session });

    await sessionManager.clearSession();

    const sessionResult = await fakeBrowser.storage.session.get(SESSION_STORAGE_KEY);
    const localResult = await fakeBrowser.storage.local.get(SESSION_PERSISTED_KEY);

    expect(sessionResult[SESSION_STORAGE_KEY]).toBeUndefined();
    expect(localResult[SESSION_PERSISTED_KEY]).toBeUndefined();
  });
});

describe('sessionManager - getSession', () => {
  it('returns null when no session exists', async () => {
    const session = await sessionManager.getSession();
    expect(session).toBeNull();
  });

  it('returns session when active and not expired', async () => {
    const session = createSession();
    await fakeBrowser.storage.session.set({ [SESSION_STORAGE_KEY]: session });

    const result = await sessionManager.getSession();
    expect(result).toBeTruthy();
    expect(result!.sessionToken).toBe('abc123');
  });

  it('returns null and clears expired session', async () => {
    const expiredSession = {
      ...createSession(),
      expiry: Date.now() - 1000,
    };
    await fakeBrowser.storage.session.set({ [SESSION_STORAGE_KEY]: expiredSession });

    const result = await sessionManager.getSession();
    expect(result).toBeNull();
  });
});

describe('sessionManager - restorePersistedSession', () => {
  it('skips restore when PRF is available', async () => {
    await reloadModule();
    await mockPrfAvailable(true);

    const session = createSession();
    await fakeBrowser.storage.local.set({ [SESSION_PERSISTED_KEY]: session });

    await sessionManager.restorePersistedSession();

    const sessionResult = await fakeBrowser.storage.session.get(SESSION_STORAGE_KEY);
    expect(sessionResult[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('restores from local storage when PRF is not available', async () => {
    await reloadModule();
    await mockPrfAvailable(false);

    const session = createSession();
    await fakeBrowser.storage.local.set({ [SESSION_PERSISTED_KEY]: session });

    await sessionManager.restorePersistedSession();

    const sessionResult = await fakeBrowser.storage.session.get(SESSION_STORAGE_KEY);
    expect(sessionResult[SESSION_STORAGE_KEY]).toBeTruthy();
  });

  it('does not restore expired sessions', async () => {
    await reloadModule();
    await mockPrfAvailable(false);

    const expiredSession = {
      ...createSession(),
      expiry: Date.now() - 1000,
    };
    await fakeBrowser.storage.local.set({ [SESSION_PERSISTED_KEY]: expiredSession });

    await sessionManager.restorePersistedSession();

    const sessionResult = await fakeBrowser.storage.session.get(SESSION_STORAGE_KEY);
    expect(sessionResult[SESSION_STORAGE_KEY]).toBeUndefined();
  });
});

describe('sessionManager - performSilentReauth', () => {
  it('returns false when PRF is not available', async () => {
    await reloadModule();
    await mockPrfAvailable(false);

    const result = await sessionManager.performSilentReauth();
    expect(result).toBe(false);
  });

  it('returns false when PRF salt is not in session storage', async () => {
    await reloadModule();
    await mockPrfAvailable(true);

    const result = await sessionManager.performSilentReauth();
    expect(result).toBe(false);
  });

  it('returns false when PRF assertion fails', async () => {
    await reloadModule();
    await mockPrfAvailable(true);

    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
    await setPrfSaltInSession(salt);

    mockPrfAssertionFails();

    const result = await sessionManager.performSilentReauth();
    expect(result).toBe(false);
  });

  it('returns false when pairing data is missing', async () => {
    await reloadModule();
    await mockPrfAvailable(true);

    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
    await setPrfSaltInSession(salt);

    const prfOutput = new Uint8Array(32).fill(0x42);
    const mockAssertion = {
      id: 'test-cred-id',
      rawId: new Uint8Array(32),
      type: 'public-key' as const,
      authenticatorAttachment: 'platform' as AuthenticatorAttachment,
      response: {} as AuthenticatorAssertionResponse,
      getClientExtensionResults: () => ({
        prf: { results: { first: prfOutput.buffer } },
      }),
      toJSON: () => ({}),
    };
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(
      mockAssertion as unknown as PublicKeyCredential,
    );

    const result = await sessionManager.performSilentReauth();
    expect(result).toBe(false);
  });
});

describe('sessionManager - PRF management', () => {
  it('sets and reads PRF availability', async () => {
    await sessionManager.setPrfAvailable();
    const available = await sessionManager.isPrfAvailable();
    expect(available).toBe(true);
  });

  it('isPrfAvailable returns false by default', async () => {
    const available = await sessionManager.isPrfAvailable();
    expect(available).toBe(false);
  });

  it('sets and retrieves PRF salt', async () => {
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    await sessionManager.setPrfSalt(salt);
    const retrieved = await sessionManager.getPrfSalt();
    expect(retrieved).toBeTruthy();
    expect(retrieved).toEqual(salt);
  });
});
