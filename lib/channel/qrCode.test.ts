import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectAccessibilityPrefs } from './qrCode';

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
