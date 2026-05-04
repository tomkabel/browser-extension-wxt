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

export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return nonce;
}

function toBase64Url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function computeCommitment(
  extensionStaticKey: Uint8Array,
  nonce: Uint8Array,
  sasCode: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = new Uint8Array([...extensionStaticKey, ...nonce, ...encoder.encode(sasCode)]);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(hash));
}

export function buildPairingUrl(
  sasCode: string,
  nonce?: Uint8Array,
  commitment?: string,
): string {
  let url = `${PAIRING_SCHEME}://${sasCode}`;
  if (nonce && commitment) {
    url += `?nonce=${toBase64Url(nonce)}&commitment=${commitment}`;
  }
  return url;
}

export function extractSasCode(url: string): string | null {
  const prefix = `${PAIRING_SCHEME}://`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const queryIndex = rest.indexOf('?');
  const code = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  if (code.length !== SAS_LENGTH || !/^\d{6}$/.test(code)) return null;
  return code;
}

export function parsePairingUrl(
  url: string,
): { sasCode: string; nonce: string | null; commitment: string | null } | null {
  const prefix = `${PAIRING_SCHEME}://`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const queryIndex = rest.indexOf('?');
  const code = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  if (code.length !== SAS_LENGTH || !/^\d{6}$/.test(code)) return null;

  let nonce: string | null = null;
  let commitment: string | null = null;
  if (queryIndex >= 0) {
    const query = rest.slice(queryIndex + 1);
    for (const part of query.split('&')) {
      const eqIndex = part.indexOf('=');
      if (eqIndex < 0) continue;
      const key = part.slice(0, eqIndex);
      const value = part.slice(eqIndex + 1);
      if (key === 'nonce') nonce = value;
      else if (key === 'commitment') commitment = value;
    }
  }

  return { sasCode: code, nonce, commitment };
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

export function encodePairingPayload(
  sasCode: string,
  sdpOffer: string | null,
  iceCandidates: string[] | null,
): string {
  const payload: {
    v: number;
    c: string;
    s?: string;
    i?: string[];
  } = {
    v: 2,
    c: sasCode,
  };

  if (sdpOffer) {
    payload.s = encodeSdp(sdpOffer);
  }

  if (iceCandidates && iceCandidates.length > 0) {
    payload.i = iceCandidates.map(candidateToShort);
  }

  return JSON.stringify(payload);
}

function encodeSdp(sdp: string): string {
  const bytes = new TextEncoder().encode(sdp);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// First 8 fields only; drops generation, ufrag, network-id (QR code size budget)
function candidateToShort(candidate: string): string {
  const parts = candidate.split(' ');
  if (parts.length >= 8) {
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]} ${parts[6]} ${parts[7]}`;
  }
  return candidate;
}

export function decodePairingPayload(
  payload: string,
): { sasCode: string; sdpOffer: string | null; iceCandidates: string[] | null } | null {
  try {
    const parsed = JSON.parse(payload) as {
      v?: number;
      c?: string;
      s?: string;
      i?: string[];
    };
    if (!parsed.c || parsed.v !== 2) return null;

    let sdpOffer: string | null = null;
    if (parsed.s) {
      const binary = atob(parsed.s);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      sdpOffer = new TextDecoder().decode(bytes);
    }

    return {
      sasCode: parsed.c,
      sdpOffer,
      iceCandidates: parsed.i ?? null,
    };
  } catch {
    return null;
  }
}
