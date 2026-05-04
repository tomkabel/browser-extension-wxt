import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve(__dirname, '..', '.output', 'chrome-mv3');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

test.describe('Challenge-Bound WebAuthn', () => {
  test.beforeAll(() => {
    const manifestExists = fs.existsSync(MANIFEST_PATH);
    test.skip(!manifestExists, 'Build extension first: bun run build');
  });

  test('challenge derivation module exports expected symbols', () => {
    const indexPath = path.resolve(__dirname, '..', 'lib', 'webauthn', 'index.ts');
    expect(fs.existsSync(indexPath)).toBe(true);

    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('deriveChallenge');
    expect(content).toContain('parseChallengeComponents');
    expect(content).toContain('generateSessionNonce');
    expect(content).toContain('serializeChallengeComponents');
    expect(content).toContain('createAssertionRequest');
    expect(content).toContain('createPasskeyCredential');
    expect(content).toContain('extractPublicKeyBytes');
  });

  test('message types registered in shared type union', () => {
    const typesPath = path.resolve(__dirname, '..', 'types', 'index.ts');
    expect(fs.existsSync(typesPath)).toBe(true);

    const content = fs.readFileSync(typesPath, 'utf-8');
    expect(content).toContain('begin-challenge-assertion');
    expect(content).toContain('assertion-complete');
    expect(content).toContain('get-cached-credential-id');
    expect(content).toContain('passkey-credential-created');
    expect(content).toContain('passkey-credential-error');
  });

  test('handler registered for begin-challenge-assertion in messageHandlers', () => {
    const handlersPath = path.resolve(__dirname, '..', 'entrypoints', 'background', 'messageHandlers.ts');
    expect(fs.existsSync(handlersPath)).toBe(true);

    const content = fs.readFileSync(handlersPath, 'utf-8');
    expect(content).toContain('begin-challenge-assertion');
    expect(content).toContain('assertion-complete');
    expect(content).toContain('get-cached-credential-id');
  });

  test('AuthPanel exports assertion status UI renderer', () => {
    const panelPath = path.resolve(__dirname, '..', 'entrypoints', 'popup', 'panels', 'AuthPanel.tsx');
    expect(fs.existsSync(panelPath)).toBe(true);

    const content = fs.readFileSync(panelPath, 'utf-8');
    expect(content).toContain('assertionStatus');
    expect(content).toContain('begin-challenge-assertion');
    expect(content).toContain('assertion:result');
    expect(content).toContain('renderAssertionStatus');
  });

  test('auth page handles challenge-assert mode', () => {
    const authPath = path.resolve(__dirname, '..', 'entrypoints', 'auth', 'main.ts');
    expect(fs.existsSync(authPath)).toBe(true);

    const content = fs.readFileSync(authPath, 'utf-8');
    expect(content).toContain('challenge-assert');
    expect(content).toContain('handleChallengeAssert');
    expect(content).toContain('get-cached-credential-id');
    expect(content).toContain('assertion-complete');
  });

  test('Android vault has ChallengeVerifier and WebAuthnVerifier classes', () => {
    const cvPath = path.resolve(__dirname, '..', 'vault-android', 'src', 'main', 'java', 'org', 'smartid', 'vault', 'webauthn', 'ChallengeVerifier.java');
    const wvPath = path.resolve(__dirname, '..', 'vault-android', 'src', 'main', 'java', 'org', 'smartid', 'vault', 'webauthn', 'WebAuthnVerifier.java');
    const tsPath = path.resolve(__dirname, '..', 'vault-android', 'src', 'main', 'java', 'org', 'smartid', 'vault', 'truststore', 'CredentialTrustStore.java');

    expect(fs.existsSync(cvPath)).toBe(true);
    expect(fs.existsSync(wvPath)).toBe(true);
    expect(fs.existsSync(tsPath)).toBe(true);

    const cvContent = fs.readFileSync(cvPath, 'utf-8');
    expect(cvContent).toContain('class ChallengeVerifier');
    expect(cvContent).toContain('verifyChallenge');
    expect(cvContent).toContain('verifyFull');

    const wvContent = fs.readFileSync(wvPath, 'utf-8');
    expect(wvContent).toContain('class WebAuthnVerifier');
    expect(wvContent).toContain('verifyAssertion');
  });

  test('store has assertion status type and fields', () => {
    const storePath = path.resolve(__dirname, '..', 'lib', 'store.ts');
    expect(fs.existsSync(storePath)).toBe(true);

    const content = fs.readFileSync(storePath, 'utf-8');
    expect(content).toContain('AssertionStatus');
    expect(content).toContain('assertionStatus');
    expect(content).toContain('assertionError');
    expect(content).toContain('setAssertionStatus');
    expect(content).toContain('setAssertionError');
  });

  test('challengeDerivation has no dead AssertionResult interface', () => {
    const derivationPath = path.resolve(__dirname, '..', 'lib', 'webauthn', 'challengeDerivation.ts');
    const content = fs.readFileSync(derivationPath, 'utf-8');
    expect(content).not.toContain('interface AssertionResult');
  });
});
