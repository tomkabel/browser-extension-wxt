import { browser } from 'wxt/browser';
import type { SignedKeyManifest } from './types';
import { KeyStore, hexToBytes } from './keyStore';
import { sortedJsonStringify, base64urlDecode } from './base64url';
import { log } from '~/lib/errors';

const MANIFEST_SIGNING_KEY_HEX =
  '0453c0135f5c4ce30d89ae2e256f954ff42967e63213a0e79f05af5e7420a31a2384cfc5714fa86acb60f27bedb8b79dd2f62a594d99074f9033b33350df0a40ae';

const MANIFEST_URL = 'https://update.smartid2.app/trusted-rp-keys.json';
const MANIFEST_FETCH_TIMEOUT_MS = 10_000;

let manifestSigningKey: CryptoKey | null = null;

async function getManifestSigningKey(): Promise<CryptoKey | null> {
  if (manifestSigningKey) return manifestSigningKey;

  try {
    const raw = hexToBytes(MANIFEST_SIGNING_KEY_HEX);
    manifestSigningKey = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return manifestSigningKey;
  } catch {
    log.warn('Failed to import manifest signing key');
    return null;
  }
}

export async function refreshKeyManifest(
  keyStore: KeyStore,
): Promise<{ success: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MANIFEST_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(MANIFEST_URL, {
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const manifest = (await response.json()) as SignedKeyManifest;

    if (!manifest.keys || !Array.isArray(manifest.keys)) {
      return { success: false, error: 'Invalid manifest format' };
    }

    if (!manifest.manifestSignature) {
      return { success: false, error: 'Manifest signature missing' };
    }

    const signingKey = await getManifestSigningKey();
    if (!signingKey) {
      return { success: false, error: 'Manifest signing key unavailable' };
    }

    const payloadBytes = new TextEncoder().encode(
      sortedJsonStringify({ version: manifest.version, keys: manifest.keys }),
    );
    const sigBytes = new Uint8Array(base64urlDecode(manifest.manifestSignature));

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      sigBytes,
      payloadBytes,
    );

    if (!valid) {
      return { success: false, error: 'Manifest signature invalid' };
    }

    const applied = keyStore.updateManifest(manifest);
    if (!applied) {
      return { success: false, error: 'Manifest version rollback rejected' };
    }

    await persistLastSeenVersions(manifest);
    log.info(`Key manifest refreshed to version ${manifest.version}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Manifest refresh failed',
    };
  }
}

async function persistLastSeenVersions(manifest: SignedKeyManifest): Promise<void> {
  const entries: Record<string, number> = {};
  for (const key of manifest.keys) {
    entries[`attestation:lastVersion:${key.keyId}`] = manifest.version;
  }
  await browser.storage.local.set(entries);
}
