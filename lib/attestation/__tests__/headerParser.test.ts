import { describe, it, expect } from 'vitest';
import { parseAttestationHeader } from '../headerParser';
import { base64urlEncode, sortedJsonStringify } from '../base64url';

const encoder = new TextEncoder();

function makeHeader(code: string, ts: number, session?: string, overrides?: Record<string, unknown>): string {
  const payload: Record<string, unknown> = { code, ts, ...overrides };
  if (session) payload.session = session;
  const payloadBytes = encoder.encode(sortedJsonStringify(payload)).buffer as ArrayBuffer;
  const payloadB64 = base64urlEncode(payloadBytes);
  const sigB64 = base64urlEncode(new Uint8Array(64).buffer);
  return `v1;${payloadB64};${sigB64};lhv-2026q1`;
}

describe('parseAttestationHeader', () => {
  it('parses valid v1 header', () => {
    const result = parseAttestationHeader(makeHeader('4892', 1715000000, 'abc123'));
    expect(result).not.toBeNull();
    expect(result!.version).toBe('v1');
    expect(result!.payload.code).toBe('4892');
    expect(result!.payload.ts).toBe(1715000000);
    expect(result!.payload.session).toBe('abc123');
    expect(result!.keyId).toBe('lhv-2026q1');
    expect(result!.signature.byteLength).toBe(64);
  });

  it('returns null for non-v1 version', () => {
    const header = makeHeader('4892', 1715000000).replace('v1', 'v2');
    expect(parseAttestationHeader(header)).toBeNull();
  });

  it('returns null for wrong part count', () => {
    expect(parseAttestationHeader('v1;payload;sig')).toBeNull();
  });

  it('returns null for empty code', () => {
    const result = parseAttestationHeader(makeHeader('', 1715000000));
    expect(result).toBeNull();
  });

  it('parses payload with zero timestamp', () => {
    const result = parseAttestationHeader(makeHeader('4892', 0));
    expect(result).not.toBeNull();
    expect(result!.payload.ts).toBe(0);
  });

  it('returns null for malformed base64url', () => {
    expect(parseAttestationHeader('v1;!!!;!!!;key-id')).toBeNull();
  });
});
