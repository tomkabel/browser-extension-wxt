import { parseAttestationHeader } from './headerParser';
import type { AttestedCode, AttestationStatus } from './types';
import { KeyStore } from './keyStore';
import { sortedJsonStringify } from './base64url';
import { log } from '~/lib/errors';

const TIMESTAMP_TOLERANCE_SECONDS = 30;
const encoder = new TextEncoder();

export function createVerifier(keyStore: KeyStore) {
  async function verifyHeader(
    rawHeader: string,
    rpDomain: string,
  ): Promise<AttestedCode | null> {
    const parsed = parseAttestationHeader(rawHeader);
    if (!parsed) return null;

    if (!validateTimestamp(parsed.payload.ts)) {
      log.warn(`Attestation timestamp rejected for ${rpDomain}`);
      return null;
    }

    const cryptoKey = await keyStore.getImportedKey(rpDomain, parsed.keyId);
    if (!cryptoKey) {
      log.warn(`Unknown or expired key-id ${parsed.keyId} for ${rpDomain}`);
      return null;
    }

    const payloadBytes = encoder.encode(
      sortedJsonStringify(parsed.payload as unknown as Record<string, unknown>),
    );

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      parsed.signature,
      payloadBytes,
    );

    if (!valid) {
      log.warn(`Invalid attestation signature for ${rpDomain}`);
      return null;
    }

    return {
      controlCode: parsed.payload.code,
      rpDomain,
      keyId: parsed.keyId,
      signature: parsed.signatureB64,
      sessionId: parsed.payload.session,
      timestamp: parsed.payload.ts,
    };
  }

  function verifyControlCode(
    attestedCode: AttestedCode | null,
    domCode: string | null,
  ): AttestationStatus {
    if (!attestedCode) {
      if (domCode) {
        log.info('DOM-only verification (no server attestation)');
        return { type: 'dom_only' };
      }
      return { type: 'not_applicable' };
    }

    if (!domCode) {
      log.warn('No DOM code available, using attested code');
      return { type: 'verified', attestedCode };
    }

    if (attestedCode.controlCode === domCode) {
      log.info('Control code match — attestation verified');
      return { type: 'verified', attestedCode };
    }

    log.warn(`Control code mismatch! Attested: ${attestedCode.controlCode}, DOM: ${domCode}`);
    return {
      type: 'rat_detected',
      attestedCode,
      domCode,
    };
  }

  function validateTimestamp(ts: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - ts) <= TIMESTAMP_TOLERANCE_SECONDS;
  }

  return {
    verifyHeader,
    verifyControlCode,
    validateTimestamp,
  };
}

export type AttestationVerifier = ReturnType<typeof createVerifier>;
