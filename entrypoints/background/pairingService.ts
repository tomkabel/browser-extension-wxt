import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';
import { createOffscreenDocument, closeOffscreenDocument } from './offscreenWebrtc';
import { generateKeyPair, toCachedPairing, fromCachedPairing } from '~/lib/channel/noise';
import type { NoiseKeyPair, CachedPairing } from '~/lib/channel/noiseTypes';

const STORAGE_KEY = 'pairing:device';
const COMMAND_CLIENT_KEY = 'cmd:commandClient';

interface PairingSession {
  sasCode: string;
  nonce: Uint8Array;
  localStaticKey: NoiseKeyPair;
  startedAt: number;
}

let activeSession: PairingSession | null = null;

export async function startPairing(
  sasCode: string,
  nonce?: Uint8Array,
): Promise<{ success: boolean; error?: string; publicKey?: number[] }> {
  if (activeSession) {
    return { success: false, error: 'Pairing session already in progress' };
  }

  const localStaticKey = generateKeyPair();
  const sessionNonce = nonce ?? crypto.getRandomValues(new Uint8Array(32));
  activeSession = {
    sasCode,
    nonce: sessionNonce,
    localStaticKey,
    startedAt: Date.now(),
  };

  const created = await createOffscreenDocument();
  if (!created) {
    activeSession = null;
    return { success: false, error: 'Failed to create WebRTC offscreen document' };
  }

  try {
    await browser.runtime.sendMessage({
      type: 'webrtc-start-pairing',
      payload: {
        sasCode,
        nonce: Array.from(sessionNonce),
        extensionStaticKey: Array.from(localStaticKey.publicKey),
      },
    });

    log.info('[Pairing] WebRTC pairing initiated');
    return {
      success: true,
      publicKey: Array.from(localStaticKey.publicKey),
    };
  } catch (err) {
    log.error('[Pairing] Failed to start WebRTC pairing:', err);
    activeSession = null;
    await closeOffscreenDocument();
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to start pairing',
    };
  }
}

export async function completePairing(remoteStaticPublicKey: Uint8Array): Promise<void> {
  if (!activeSession) {
    throw new Error('No active pairing session');
  }

  const cached = toCachedPairing(activeSession.localStaticKey, remoteStaticPublicKey, 'XX');

  await browser.storage.session.set({
    [STORAGE_KEY]: cached,
    [COMMAND_CLIENT_KEY]: true,
  });

  log.info('[Pairing] Device paired and keys cached');

  activeSession = null;
}

export async function getCachedPairing(): Promise<{
  localStaticKey: NoiseKeyPair;
  remoteStaticPublicKey: Uint8Array;
} | null> {
  const stored = await browser.storage.session.get(STORAGE_KEY);
  const cached = stored[STORAGE_KEY] as CachedPairing | undefined;

  if (!cached) return null;

  return fromCachedPairing(cached);
}

export async function isDevicePaired(): Promise<boolean> {
  const pairing = await getCachedPairing();
  return pairing !== null;
}

export async function clearPairing(): Promise<void> {
  await browser.storage.session.remove([STORAGE_KEY, COMMAND_CLIENT_KEY]);
  await closeOffscreenDocument();
  activeSession = null;
  log.info('[Pairing] Pairing data cleared');
}

export function getActiveSession(): PairingSession | null {
  return activeSession;
}
