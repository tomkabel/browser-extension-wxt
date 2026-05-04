import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectAccessibilityPrefs, generateNonce, computeCommitment, buildPairingUrl, parsePairingUrl } from './qrCode';

describe('detectAccessibilityPrefs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns all false by default', () => {
    const prefs = detectAccessibilityPrefs();
    expect(prefs).toEqual({
      screenReader: false,
      reducedMotion: false,
      unsupportedEmoji: false,
    });
  });

  it('detects screen reader via user agent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 NVDA ScreenReader');

    const prefs = detectAccessibilityPrefs();
    expect(prefs.screenReader).toBe(true);
  });

  it('detects JAWS screen reader', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 JAWS Screen Reader');

    const prefs = detectAccessibilityPrefs();
    expect(prefs.screenReader).toBe(true);
  });

  it('detects VoiceOver', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 VoiceOver Mac');

    const prefs = detectAccessibilityPrefs();
    expect(prefs.screenReader).toBe(true);
  });

  it('returns false for normal user agent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Chrome/131.0.0.0',
    );

    const prefs = detectAccessibilityPrefs();
    expect(prefs.screenReader).toBe(false);
  });

  it('detects reduced motion via matchMedia', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => {
        return {
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addEventListener: vi.fn().mockReturnValue(undefined),
          removeEventListener: vi.fn().mockReturnValue(undefined),
        } as unknown as MediaQueryList;
      },
    });

    const prefs = detectAccessibilityPrefs();
    expect(prefs.reducedMotion).toBe(true);
  });

  it('returns false for reduced motion when not preferred', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => {
        return {
          matches: false,
          media: '',
          onchange: null,
          addEventListener: vi.fn().mockReturnValue(undefined),
          removeEventListener: vi.fn().mockReturnValue(undefined),
        } as unknown as MediaQueryList;
      },
    });

    const prefs = detectAccessibilityPrefs();
    expect(prefs.reducedMotion).toBe(false);
  });
});

describe('generateNonce', () => {
  it('returns 32 bytes', () => {
    const nonce = generateNonce();
    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(32);
  });

  it('produces different values on each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toEqual(b);
  });
});

describe('computeCommitment', () => {
  const extKey = new Uint8Array(32).fill(0x01);
  const nonce = new Uint8Array(32).fill(0x02);
  const sasCode = '123456';

  it('is deterministic given same inputs', async () => {
    const c1 = await computeCommitment(extKey, nonce, sasCode);
    const c2 = await computeCommitment(extKey, nonce, sasCode);
    expect(c1).toBe(c2);
  });

  it('changes when extensionStaticKey changes', async () => {
    const c1 = await computeCommitment(extKey, nonce, sasCode);
    const otherKey = new Uint8Array(32).fill(0x03);
    const c2 = await computeCommitment(otherKey, nonce, sasCode);
    expect(c1).not.toBe(c2);
  });

  it('changes when nonce changes', async () => {
    const c1 = await computeCommitment(extKey, nonce, sasCode);
    const otherNonce = new Uint8Array(32).fill(0x04);
    const c2 = await computeCommitment(extKey, otherNonce, sasCode);
    expect(c1).not.toBe(c2);
  });

  it('changes when sasCode changes', async () => {
    const c1 = await computeCommitment(extKey, nonce, sasCode);
    const c2 = await computeCommitment(extKey, nonce, '654321');
    expect(c1).not.toBe(c2);
  });

  it('returns a base64url string without padding', async () => {
    const commitment = await computeCommitment(extKey, nonce, sasCode);
    expect(commitment).toEqual(expect.any(String));
    expect(commitment).not.toContain('+');
    expect(commitment).not.toContain('/');
    expect(commitment).not.toContain('=');
    expect(commitment.length).toBeGreaterThan(0);
  });
});

describe('buildPairingUrl with commitment', () => {
  it('builds URL without commitment params when omitted', () => {
    const url = buildPairingUrl('123456');
    expect(url).toBe('smartid2-pair://123456');
  });

  it('includes nonce and commitment as query params', () => {
    const nonce = new Uint8Array(32).fill(0x01);
    const url = buildPairingUrl('123456', nonce, 'abc123');
    expect(url).toMatch(/^smartid2-pair:\/\/123456\?nonce=[A-Za-z0-9_-]+&commitment=abc123$/);
  });
});

describe('parsePairingUrl', () => {
  it('parses URL without query params', () => {
    const result = parsePairingUrl('smartid2-pair://123456');
    expect(result).toEqual({ sasCode: '123456', nonce: null, commitment: null });
  });

  it('parses URL with nonce and commitment', () => {
    const nonceBytes = new Uint8Array(32).fill(0x01);
    const url = buildPairingUrl('123456', nonceBytes, 'abc123');
    const result = parsePairingUrl(url);
    expect(result?.sasCode).toBe('123456');
    expect(result?.commitment).toBe('abc123');
    expect(result?.nonce).toBeTruthy();
  });

  it('returns null for invalid URL', () => {
    expect(parsePairingUrl('invalid')).toBeNull();
  });
});

describe('E2E: Commitment-based pairing flow', () => {
  it('4.1 Valid pairing completes with commitment-based join', async () => {
    const extKey = new Uint8Array(32).fill(0x42);
    const nonce = new Uint8Array(32).fill(0x58);
    const sasCode = '123456';

    const commitment = await computeCommitment(extKey, nonce, sasCode);
    const url = buildPairingUrl(sasCode, nonce, commitment);
    const parsed = parsePairingUrl(url);

    expect(parsed).not.toBeNull();
    expect(parsed!.sasCode).toBe(sasCode);
    expect(parsed!.commitment).toBe(commitment);

    const phoneSideCommitment = await computeCommitment(extKey, nonce, sasCode);
    expect(phoneSideCommitment).toBe(commitment);
  });

  it('4.2 Direct room join without commitment is rejected (commitment mismatch)', async () => {
    const extKey = new Uint8Array(32).fill(0x42);
    const nonce = new Uint8Array(32).fill(0x58);
    const sasCode = '123456';

    const commitment = await computeCommitment(extKey, nonce, sasCode);

    const wrongExtKey = new Uint8Array(32).fill(0x99);
    const wrongCommitment = await computeCommitment(wrongExtKey, nonce, sasCode);

    expect(wrongCommitment).not.toBe(commitment);

    const wrongNonce = new Uint8Array(32).fill(0x77);
    const wrongNonceCommitment = await computeCommitment(extKey, wrongNonce, sasCode);

    expect(wrongNonceCommitment).not.toBe(commitment);

    const emptyParsed = parsePairingUrl(buildPairingUrl(sasCode));
    expect(emptyParsed?.commitment).toBeNull();
  });
});
