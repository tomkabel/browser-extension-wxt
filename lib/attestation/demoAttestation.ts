import { sortedJsonStringify, base64urlEncode } from './base64url';
import { WHITELISTED_RP_DOMAINS } from './keyStore';
import { isDemoMode } from './env';
import { log } from '~/lib/errors';

const encoder = new TextEncoder();

const DEMO_PRIVATE_KEYS: Record<string, JsonWebKey> = {
  'lhv-2026q1': { kty: 'EC', x: 'MOpYVpggPsIkJwYgAFEXZY9KVnQ4qELTNrft8IIbhgI', y: 'oDefQj0jKqAVjubIwG8YxqCDpQe-MaIbE98qKvhr0Ds', crv: 'P-256', d: 'Jzp-nEuXfrLkKoAolgvlP3KC5iP6106-EYbfW-mFPEQ', ext: false },
  'lhv-2026q2': { kty: 'EC', x: 'uO1G9qTZkGpFYYm2yQUVztGUTfipwQyg5V0DFZJFpVw', y: 'zPZMJJSGsH1PnOef3NOextm1cvOIahRBZ5e6-ySbQ2c', crv: 'P-256', d: 'ETsowaLz3o62oUc2cKhaEHNL42GKTPIXWgxP5pENPN0', ext: false },
  'swed-2026q1': { kty: 'EC', x: 'NTdXRUDUkrH0xkgVqfRK0U89xmA_FrCJjFq5KsblnHk', y: 'kzqhVLE1vsxm-QprSocZYc2-VpYqISoqdanhixcz9YM', crv: 'P-256', d: '6-GafLfG41xLVlcWJxV-PTs0uULOeAmI6yEeWQ5f6Mw', ext: false },
  'swed-2026q2': { kty: 'EC', x: 'IZt-fwTmWUGlqqC0sCLxyr9V8f1XWQLx7BivkgcX7pI', y: 'oPpyuAeKZKY_-9u6ZrxMOTm8ubt-LlHkggY4AhsV3cI', crv: 'P-256', d: 'V2r8cV-PDQ42PE54oVwNus8bj0bTwLGq3zjQfR8AIe8', ext: false },
  'seb-2026q1': { kty: 'EC', x: 'GqFNH5Y70SY2gagC3j-eQTDKgDPKvXT_WpUirrfO30c', y: 'SfxoEKN1xS61yP1jAW_-K2oiJtuSMNXezPwgpVWm3F0', crv: 'P-256', d: '0_7z8t4WNjyJuY53IGzOJ4LnxiWwRiZ-f_1fq-hD5AI', ext: false },
  'seb-2026q2': { kty: 'EC', x: 'EiHRug4eSUGo2nlSUSPnYXcnNgezZBMZyz3iBrCCbHY', y: 'QyHPthz8dMTn-lWH97INCq61-qW2gLJ3KE9hjka3mw0', crv: 'P-256', d: 'a98TYPF14J4yOJgnvNcJW6MWATaw8zb6GUsxsjLfLBA', ext: false },
  'tara-2026q1': { kty: 'EC', x: '2KOSIusV1kU5WMvET1jQL9K36iznbl7dQrx4gZXwt2w', y: 'FtK6PvQWqUlyiCLbcPfIibMb6Tc4W-0LzQyPZShAmeY', crv: 'P-256', d: 'pcHX_28m8gaaCJ9UwsvBeQWQPXtch0vCf5K8b8GAzWY', ext: false },
  'tara-2026q2': { kty: 'EC', x: 'dajMTd-C_z-EGQHyGURKZvJCxP_Domxo_jHcPUSbZ0Q', y: 'Eifs6SvgY8Hpq1xtWGAxNUs8e5p-PiyDB7lSq3hg_70', crv: 'P-256', d: 'AlxBsTEDu2xWh_q8MO6yGGQW0O9YqloF6U7Lbxw-Tls', ext: false },
};

const importedKeyCache = new Map<string, CryptoKey>();

async function getDemoPrivateKey(keyId: string): Promise<CryptoKey | null> {
  const cached = importedKeyCache.get(keyId);
  if (cached) return cached;

  const jwk = DEMO_PRIVATE_KEYS[keyId];
  if (!jwk) {
    log.warn(`No demo private key available for keyId: ${keyId}`);
    return null;
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    importedKeyCache.set(keyId, cryptoKey);
    return cryptoKey;
  } catch (err) {
    log.error(`Failed to import demo private key for ${keyId}:`, err);
    return null;
  }
}

export async function createDemoAttestationHeader(
  controlCode: string,
  rpDomain: string,
  keyId: string,
  sessionId?: string,
): Promise<string | null> {
  if (!isDemoMode()) {
    log.warn('Demo attestation only available in dev/demo mode');
    return null;
  }

  if (!WHITELISTED_RP_DOMAINS.includes(rpDomain as typeof WHITELISTED_RP_DOMAINS[number])) {
    log.warn(`Domain ${rpDomain} is not whitelisted for attestation`);
    return null;
  }

  const privateKey = await getDemoPrivateKey(keyId);
  if (!privateKey) return null;

  try {
    const ts = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = { code: controlCode, ts };
    if (sessionId) payload.session = sessionId;

    const payloadBytes = encoder.encode(sortedJsonStringify(payload));
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      payloadBytes,
    );

    const payloadB64 = base64urlEncode(payloadBytes.slice().buffer as ArrayBuffer);
    const sigB64 = base64urlEncode(signature);

    return `v1;${payloadB64};${sigB64};${keyId}`;
  } catch (err) {
    log.error('Failed to create demo attestation header:', err);
    return null;
  }
}
