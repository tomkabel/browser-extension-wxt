import { describe, it, expect } from 'vitest';
import { KeyStore } from '../keyStore';

function makeKey(domain: string, keyId: string, active = true): {
  domain: string; keyId: string; publicKeyHex: string;
  notBefore: string; notAfter: string;
} {
  const now = new Date();
  const notBefore = active
    ? new Date(now.getTime() - 86400000).toISOString()
    : new Date(now.getTime() + 86400000).toISOString();
  const notAfter = active
    ? new Date(now.getTime() + 86400000).toISOString()
    : new Date(now.getTime() + 2 * 86400000).toISOString();
  return {
    domain,
    keyId,
    publicKeyHex: '04ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    notBefore,
    notAfter,
  };
}

describe('KeyStore', () => {
  it('returns undefined for unknown key', () => {
    const store = new KeyStore();
    expect(store.getKey('lhv.ee', 'unknown')).toBeUndefined();
  });

  it('returns key for known domain and keyId', () => {
    const store = new KeyStore([makeKey('lhv.ee', 'lhv-2026q1')]);
    const key = store.getKey('lhv.ee', 'lhv-2026q1');
    expect(key).toBeDefined();
    expect(key!.domain).toBe('lhv.ee');
  });

  it('returns no keys for non-whitelisted domain', () => {
    const store = new KeyStore([makeKey('lhv.ee', 'lhv-2026q1')]);
    expect(store.getKey('evil.com', 'lhv-2026q1')).toBeUndefined();
  });

  it('lists all keys for a domain', () => {
    const store = new KeyStore([
      makeKey('lhv.ee', 'lhv-2026q1'),
      makeKey('lhv.ee', 'lhv-2026q2'),
    ]);
    const keys = store.getAllKeysForDomain('lhv.ee');
    expect(keys.length).toBe(2);
  });

  it('rejects expired keys', () => {
    const store = new KeyStore([makeKey('lhv.ee', 'lhv-old', false)]);
    expect(store.getKey('lhv.ee', 'lhv-old')).toBeUndefined();
  });

  it('rejects manifest with version <= current', () => {
    const store = new KeyStore();
    store.updateManifest({
      version: 2,
      keys: [makeKey('lhv.ee', 'lhv-v2')],
      manifestSignature: '',
    });
    const result = store.updateManifest({
      version: 1,
      keys: [makeKey('lhv.ee', 'lhv-v1')],
      manifestSignature: '',
    });
    expect(result).toBe(false);
  });

  it('accepts manifest with higher version', () => {
    const store = new KeyStore();
    const result = store.updateManifest({
      version: 2,
      keys: [makeKey('lhv.ee', 'lhv-v2')],
      manifestSignature: '',
    });
    expect(result).toBe(true);
  });
});
