import QRCode from 'qrcode';

const SAS_LENGTH = 6;
const PAIRING_SCHEME = 'smartid2-pair';

export function generateSasCode(): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < SAS_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function buildPairingUrl(sasCode: string): string {
  return `${PAIRING_SCHEME}://${sasCode}`;
}

export function extractSasCode(url: string): string | null {
  const prefix = `${PAIRING_SCHEME}://`;
  if (!url.startsWith(prefix)) return null;
  const code = url.slice(prefix.length);
  if (code.length !== SAS_LENGTH || !/^\d{6}$/.test(code)) return null;
  return code;
}

export async function drawQrCode(data: string, canvas: HTMLCanvasElement): Promise<void> {
  await QRCode.toCanvas(canvas, data, {
    width: 232,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

export const SAS_TTL_MS = 60_000;

export interface AccessibilityPrefs {
  screenReader: boolean;
  reducedMotion: boolean;
  unsupportedEmoji: boolean;
}

export function detectAccessibilityPrefs(): AccessibilityPrefs {
  let screenReader = false;

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (/Screen ?Reader|NVDA|JAWS|Voice ?Over/i.test(ua)) {
      screenReader = true;
    }

    if ('accessibility' in navigator) {
      const nav = navigator as Navigator & {
        accessibility?: { isScreenReaderActive?: boolean };
      };
      if (nav.accessibility?.isScreenReaderActive) {
        screenReader = true;
      }
    }
  }

  let reducedMotion = false;

  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  let unsupportedEmoji = false;

  try {
    const testEmoji = '\u{1F600}';
    if (!('toWellFormed' in String.prototype)) {
      unsupportedEmoji = true;
    } else {
      const str = String(testEmoji);
      if (str.length === 0) {
        unsupportedEmoji = true;
      }
    }
  } catch {
    unsupportedEmoji = true;
  }

  return { screenReader, reducedMotion, unsupportedEmoji };
}
