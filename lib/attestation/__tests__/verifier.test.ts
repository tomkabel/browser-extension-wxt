import { describe, it, expect } from 'vitest';
import { createVerifier } from '../verifier';
import { KeyStore } from '../keyStore';

describe('verifyControlCode', () => {
  it('matching codes pass verification', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);

    const attested = { controlCode: '4892', rpDomain: 'lhv.ee', keyId: 'test', signature: '' };
    const result = verifier.verifyControlCode(attested, '4892');

    expect(result.type).toBe('verified');
    if (result.type === 'verified') {
      expect(result.attestedCode.controlCode).toBe('4892');
    }
  });

  it('mismatching codes trigger rat_detected', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);

    const attested = { controlCode: '4892', rpDomain: 'lhv.ee', keyId: 'test', signature: '' };
    const result = verifier.verifyControlCode(attested, '1234');

    expect(result.type).toBe('rat_detected');
    if (result.type === 'rat_detected') {
      expect(result.attestedCode.controlCode).toBe('4892');
      expect(result.domCode).toBe('1234');
    }
  });

  it('falls back to dom-only when no attestation', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);

    const result = verifier.verifyControlCode(null, '4892');
    expect(result.type).toBe('dom_only');
  });

  it('returns not_applicable when neither attestation nor dom code', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);

    const result = verifier.verifyControlCode(null, null);
    expect(result.type).toBe('not_applicable');
  });

  it('uses attested code when no DOM code but attestation exists', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);

    const attested = { controlCode: '4892', rpDomain: 'lhv.ee', keyId: 'test', signature: '' };
    const result = verifier.verifyControlCode(attested, null);

    expect(result.type).toBe('verified');
  });
});

describe('timestamp validation', () => {
  it('accepts current timestamp', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);
    const now = Math.floor(Date.now() / 1000);
    expect(verifier.validateTimestamp(now)).toBe(true);
  });

  it('rejects timestamp 31s in the past', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);
    const past = Math.floor(Date.now() / 1000) - 31;
    expect(verifier.validateTimestamp(past)).toBe(false);
  });

  it('accepts timestamp 29s in the past', () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);
    const past = Math.floor(Date.now() / 1000) - 29;
    expect(verifier.validateTimestamp(past)).toBe(true);
  });
});

describe('key store', () => {
  it('rejects unknown key-id in verifyHeader', async () => {
    const store = new KeyStore();
    const verifier = createVerifier(store);
    const result = await verifier.verifyHeader(
      'v1;eyJjb2RlIjoiNDg5MiIsInRzIjoxNzAwMDAwMDAwfQ;c2lnbmF0dXJl;unknown-key',
      'lhv.ee',
    );
    expect(result).toBeNull();
  });
});
