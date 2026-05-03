import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  generatePrfSalt,
  cachePrfCredentialId,
  getCachedPrfCredentialId,
  clearPrfCredentialCache,
  generateAndStoreKeypair,
  unlockKeypair,
  hasStoredKeypair,
  clearStoredKeypair,
} from './fallbackAuth';

vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('fallbackAuth - PRF salt', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('generatePrfSalt', () => {
    it('generates SHA-256 hash of phone key + domain', async () => {
      const phoneKey = new Uint8Array(32);
      crypto.getRandomValues(phoneKey);
      const salt = await generatePrfSalt(phoneKey);

      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it('produces deterministic output for same input', async () => {
      const phoneKey = new Uint8Array(32).fill(0x42);
      const salt1 = await generatePrfSalt(phoneKey);
      const salt2 = await generatePrfSalt(phoneKey);

      expect(salt1).toEqual(salt2);
    });

    it('produces different output for different phone keys', async () => {
      const key1 = new Uint8Array(32).fill(0x01);
      const key2 = new Uint8Array(32).fill(0x02);
      const salt1 = await generatePrfSalt(key1);
      const salt2 = await generatePrfSalt(key2);

      expect(salt1).not.toEqual(salt2);
    });
  });
});

describe('fallbackAuth - PRF credential cache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('caches and retrieves credential ID', async () => {
    const testId = 'test-cred-id-12345';

    await cachePrfCredentialId(testId);
    const cached = await getCachedPrfCredentialId();

    expect(cached).toBe(testId);
  });

  it('returns null when no credential is cached', async () => {
    const cached = await getCachedPrfCredentialId();
    expect(cached).toBeNull();
  });

  it('clears cached credential ID', async () => {
    const testId = 'test-cred-id-67890';

    await cachePrfCredentialId(testId);
    await clearPrfCredentialCache();

    const cached = await getCachedPrfCredentialId();
    expect(cached).toBeNull();
  });
});

describe('fallbackAuth - PIN keypair', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('generates and stores a keypair', async () => {
    const keypair = await generateAndStoreKeypair('123456');
    expect(keypair).toBeTruthy();
    expect(keypair.privateKey).toBeTruthy();
    expect(keypair.publicKey).toBeTruthy();
  });

  it('unlocks a stored keypair with correct PIN', async () => {
    await generateAndStoreKeypair('123456');
    const unlocked = await unlockKeypair('123456');
    expect(unlocked).toBeTruthy();
    expect(unlocked.privateKey).toBeTruthy();
  });

  it('throws on wrong PIN', async () => {
    await generateAndStoreKeypair('123456');
    await expect(unlockKeypair('wrongpin')).rejects.toThrow('Invalid PIN');
  });

  it('throws when no keypair is stored', async () => {
    await expect(unlockKeypair('123456')).rejects.toThrow('No stored keypair found');
  });

  it('checks if a keypair is stored', async () => {
    expect(await hasStoredKeypair()).toBe(false);
    await generateAndStoreKeypair('123456');
    expect(await hasStoredKeypair()).toBe(true);
  });

  it('clears stored keypair', async () => {
    await generateAndStoreKeypair('123456');
    expect(await hasStoredKeypair()).toBe(true);

    await clearStoredKeypair();
    expect(await hasStoredKeypair()).toBe(false);
  });
});
