import type { AttestationHeaderPayload } from './types';
import { base64urlDecode } from './base64url';
import { log } from '~/lib/errors';

const encoder = new TextDecoder();

export interface ParsedAttestationHeader {
  version: string;
  payload: AttestationHeaderPayload;
  signature: ArrayBuffer;
  keyId: string;
}

export function parseAttestationHeader(rawHeader: string): ParsedAttestationHeader | null {
  const parts = rawHeader.split(';');
  if (parts[0] !== 'v1' || parts.length !== 4) {
    log.warn('Invalid attestation header format');
    return null;
  }

  const payloadB64 = parts[1] as string;
  const sigB64 = parts[2] as string;
  const keyId = parts[3] as string;

  try {
    const payloadBytes = base64urlDecode(payloadB64);
    const payloadText = encoder.decode(payloadBytes);
    const payload = JSON.parse(payloadText) as AttestationHeaderPayload;

    if (typeof payload.code !== 'string' || payload.code.length === 0) {
      log.warn('Attestation payload missing control code');
      return null;
    }
    if (typeof payload.ts !== 'number') {
      log.warn('Attestation payload missing timestamp');
      return null;
    }

    const signature = base64urlDecode(sigB64);

    return {
      version: parts[0] as string,
      payload,
      signature,
      keyId,
    };
  } catch (err) {
    log.warn('Failed to parse attestation header:', err);
    return null;
  }
}
