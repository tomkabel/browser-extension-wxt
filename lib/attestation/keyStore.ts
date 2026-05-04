import { browser } from 'wxt/browser';
import type { TrustedRpSigningKey, SignedKeyManifest, RpKeyStore } from './types';
import { log } from '~/lib/errors';

export const WHITELISTED_RP_DOMAINS = [
  'lhv.ee',
  'swedbank.ee',
  'seb.ee',
  'tara.ria.ee',
] as const;

export class KeyStore implements RpKeyStore {
  private keys: Map<string, TrustedRpSigningKey> = new Map();
  private importedKeys: Map<string, CryptoKey> = new Map();
  private manifestVersion = 0;

  constructor(initialKeys: TrustedRpSigningKey[] = []) {
    for (const key of initialKeys) {
      this.addKey(key);
    }
  }

  addKey(key: TrustedRpSigningKey): void {
    const id = `${key.domain}:${key.keyId}`;
    this.keys.set(id, key);
    this.importedKeys.delete(id);
  }

  getKey(domain: string, keyId: string): TrustedRpSigningKey | undefined {
    const key = this.keys.get(`${domain}:${keyId}`);
    if (!key) return undefined;
    if (!this.isKeyActive(key)) return undefined;
    return key;
  }

  getAllKeysForDomain(domain: string): TrustedRpSigningKey[] {
    const result: TrustedRpSigningKey[] = [];
    for (const [, key] of this.keys) {
      if (key.domain === domain && this.isKeyActive(key)) {
        result.push(key);
      }
    }
    return result;
  }

  async getImportedKey(domain: string, keyId: string): Promise<CryptoKey | null> {
    const id = `${domain}:${keyId}`;
    const cached = this.importedKeys.get(id);
    if (cached) return cached;

    const key = this.getKey(domain, keyId);
    if (!key) return null;

    try {
      const raw = hexToBytes(key.publicKeyHex);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify'],
      );
      this.importedKeys.set(id, cryptoKey);
      return cryptoKey;
    } catch (err) {
      log.warn(`Failed to import key ${id}:`, err);
      return null;
    }
  }

  getManifestVersion(): number {
    return this.manifestVersion;
  }

  updateManifest(manifest: SignedKeyManifest): boolean {
    if (manifest.version <= this.manifestVersion) {
      log.warn('Rejecting manifest with version <= current');
      return false;
    }

    for (const key of manifest.keys) {
      this.addKey(key);
    }
    this.manifestVersion = manifest.version;
    log.info(`Key manifest updated to version ${manifest.version} with ${manifest.keys.length} keys`);
    return true;
  }

  async getLastSeenVersion(keyId: string): Promise<number> {
    const stored = await browser.storage.local.get(`attestation:lastVersion:${keyId}`);
    return (stored[`attestation:lastVersion:${keyId}`] as number) ?? 0;
  }

  private isKeyActive(key: TrustedRpSigningKey): boolean {
    const now = new Date();
    const notBefore = new Date(key.notBefore);
    const notAfter = new Date(key.notAfter);
    return now >= notBefore && now <= notAfter;
  }

  keyCount(): number {
    return this.keys.size;
  }
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
