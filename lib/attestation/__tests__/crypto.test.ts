import { describe, it, expect } from 'vitest';
import { KeyStore } from '../keyStore';
import { createVerifier } from '../verifier';
import { createDemoAttestationHeader } from '../demoAttestation';
import { parseAttestationHeader } from '../headerParser';
import { base64urlEncode } from '../base64url';
import bundledManifest from '../trusted-rp-keys.json';

describe('end-to-end crypto verification', () => {
  it('generated attestation header is parseable', async () => {
    const header = await createDemoAttestationHeader('4892', 'lhv.ee', 'lhv-2026q1', 'sess001');
    expect(header).not.toBeNull();

    const parsed = parseAttestationHeader(header!);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.code).toBe('4892');
    expect(parsed!.payload.session).toBe('sess001');
    expect(parsed!.payload.ts).toBeGreaterThan(0);
    expect(parsed!.keyId).toBe('lhv-2026q1');
    expect(parsed!.signature.byteLength).toBeGreaterThan(0);
  });

  it('signed and verified attestation passes full pipeline for each domain', async () => {
    const domainPrefixes: Record<string, string> = {
      'lhv.ee': 'lhv',
      'swedbank.ee': 'swed',
      'seb.ee': 'seb',
      'tara.ria.ee': 'tara',
    };
    const periods = ['2026q1', '2026q2'];

    for (const [domain, prefix] of Object.entries(domainPrefixes)) {
      for (const period of periods) {
        const keyId = `${prefix}-${period}`;

        const header = await createDemoAttestationHeader('4892', domain, keyId);
        expect(header).not.toBeNull();

        const keyStore = new KeyStore(bundledManifest.keys);
        const verifier = createVerifier(keyStore);

        const result = await verifier.verifyHeader(header!, domain);
        expect(result).not.toBeNull();
        expect(result!.controlCode).toBe('4892');
        expect(result!.rpDomain).toBe(domain);
        expect(result!.keyId).toBe(keyId);
      }
    }
  });

  it('verified control code cross-references with DOM code', async () => {
    const keyStore = new KeyStore(bundledManifest.keys);
    const verifier = createVerifier(keyStore);

    const header = await createDemoAttestationHeader('4892', 'lhv.ee', 'lhv-2026q1');
    expect(header).not.toBeNull();

    const attested = await verifier.verifyHeader(header!, 'lhv.ee');
    expect(attested).not.toBeNull();

    const status = verifier.verifyControlCode(attested, '4892');
    expect(status.type).toBe('verified');
  });

  it('tampered header fails verification', async () => {
    const keyStore = new KeyStore(bundledManifest.keys);
    const verifier = createVerifier(keyStore);

    const header = await createDemoAttestationHeader('4892', 'lhv.ee', 'lhv-2026q1');
    expect(header).not.toBeNull();

    const parts = header!.split(';');
    const tamperedPayload = btoa(JSON.stringify({ code: '0000', ts: Math.floor(Date.now() / 1000) }));
    const tampered = `v1;${tamperedPayload};${parts[2]};${parts[3]}`;

    const result = await verifier.verifyHeader(tampered, 'lhv.ee');
    expect(result).toBeNull();
  });

  it('unknown key-id returns null gracefully', async () => {
    const keyStore = new KeyStore(bundledManifest.keys);
    const verifier = createVerifier(keyStore);

    const header = await createDemoAttestationHeader('4892', 'lhv.ee', 'lhv-2026q1');
    expect(header).not.toBeNull();

    const result = await verifier.verifyHeader(header!, 'swedbank.ee');
    expect(result).toBeNull();
  });

  it('timestamp skew beyond 30s is rejected', async () => {
    const keyStore = new KeyStore(bundledManifest.keys);
    const verifier = createVerifier(keyStore);

    const header = await createDemoAttestationHeader('4892', 'lhv.ee', 'lhv-2026q1');
    expect(header).not.toBeNull();

    const parts = header!.split(';');
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    ));
    payload.ts = Math.floor(Date.now() / 1000) - 35;

    const encoder = new TextEncoder();
    const newPayloadBytes = encoder.encode(JSON.stringify(payload));
    const newPayloadB64 = base64urlEncode(newPayloadBytes.buffer as ArrayBuffer);

    const spoofedHeader = `v1;${newPayloadB64};${parts[2]};${parts[3]}`;
    const result = await verifier.verifyHeader(spoofedHeader, 'lhv.ee');
    expect(result).toBeNull();
  });
});
