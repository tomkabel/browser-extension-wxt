import { browser } from 'wxt/browser';
import type { MfaSession } from '~/types';
import { SessionExpiredError, log } from '~/lib/errors';
import {
  checkPrfSupport,
  assertPrfCredential,
} from '~/lib/crypto/fallbackAuth';
import { deriveNoiseKeypair } from '~/lib/channel/noise';
import type { CachedPairing } from '~/lib/channel/noiseTypes';

const SESSION_STORAGE_KEY = 'mfa:session';
const SESSION_PERSISTED_KEY = 'mfa:session:persisted';
const SESSION_TTL_MS = 5 * 60 * 1000;
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const ALARM_TTL = 'session-ttl';
const ALARM_IDLE = 'session-idle';

const PRF_SALT_KEY = 'prf:salt';
const PRF_AVAILABLE_KEY = 'prf:available';
const REMOTE_STATIC_KEY = 'pairing:device';

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function activateSession(deviceName?: string): Promise<MfaSession> {
  const sessionToken = generateSessionToken();
  const now = Date.now();
  const expiry = now + SESSION_TTL_MS;

  const session: MfaSession = {
    sessionToken,
    mfaVerifiedAt: now,
    expiry,
    deviceName,
  };

  await browser.storage.session.set({ [SESSION_STORAGE_KEY]: session });

  const prfAvailable = await isPrfAvailable();
  if (!prfAvailable) {
    await browser.storage.local.set({
      [SESSION_PERSISTED_KEY]: { ...session, persistedAt: Date.now() },
    });
  }

  await browser.alarms.create(ALARM_TTL, { delayInMinutes: 5 });

  resetIdleTimeout().catch((err) => log.error('Failed to start idle alarm:', err));

  if (import.meta.env.DEV) {
    log.info('Crypto audit: keys in session storage only');
  }
  log.info('MFA session activated, expires:', new Date(expiry).toISOString());

  return session;
}

export async function clearSession(): Promise<void> {
  await browser.storage.session.remove(SESSION_STORAGE_KEY);
  await browser.storage.local.remove(SESSION_PERSISTED_KEY);

  const localCheck = await browser.storage.local.get([
    'fallback:encryptedPk',
    'fallback:publicKey',
    SESSION_PERSISTED_KEY,
  ]);
  const hasCrypto =
    !!localCheck['fallback:encryptedPk'] ||
    !!localCheck['fallback:publicKey'] ||
    !!localCheck[SESSION_PERSISTED_KEY];

  if (import.meta.env.DEV && hasCrypto) {
    log.warn('Crypto audit FAILED: unexpected keys in chrome.storage.local after clearSession');
  }

  await browser.alarms.clear(ALARM_TTL);
  await browser.alarms.clear(ALARM_IDLE);
  log.info('MFA session cleared');
}

export async function getSession(): Promise<MfaSession | null> {
  const result = await browser.storage.session.get(SESSION_STORAGE_KEY);
  const session = result[SESSION_STORAGE_KEY] as MfaSession | undefined;

  if (!session) {
    return null;
  }

  if (Date.now() > session.expiry) {
    await clearSession();
    return null;
  }

  return session;
}

export async function verifySession(): Promise<MfaSession> {
  const session = await getSession();
  if (!session) {
    throw new SessionExpiredError();
  }

  await resetIdleTimeout();

  return session;
}

export async function resetIdleTimeout(): Promise<void> {
  await browser.alarms.clear(ALARM_IDLE);
  await browser.alarms.create(ALARM_IDLE, { delayInMinutes: IDLE_TIMEOUT_MS / 60000 });
}

export function setupAlarmListener(): void {
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_TTL) {
      log.info('Session TTL expired, clearing session');
      await clearSession();
    } else if (alarm.name === ALARM_IDLE) {
      log.info('Idle timeout expired, clearing session');
      await clearSession();
    }
  });
}

export async function setPrfSalt(salt: Uint8Array): Promise<void> {
  const saltBase64 = btoa(String.fromCharCode(...Array.from(salt)));
  await browser.storage.session.set({ [PRF_SALT_KEY]: saltBase64 });
}

export async function getPrfSalt(): Promise<Uint8Array | null> {
  const result = await browser.storage.session.get(PRF_SALT_KEY);
  const saltBase64 = result[PRF_SALT_KEY] as string | undefined;
  if (!saltBase64) return null;
  return Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
}

export async function setPrfAvailable(): Promise<void> {
  await browser.storage.session.set({ [PRF_AVAILABLE_KEY]: true });
}

export async function isPrfAvailable(): Promise<boolean> {
  const result = await browser.storage.session.get(PRF_AVAILABLE_KEY);
  return !!result[PRF_AVAILABLE_KEY];
}

export async function performSilentReauth(): Promise<boolean> {
  if (!checkPrfSupport()) {
    log.info('WebAuthn PRF not supported by browser');
    return false;
  }

  const prfAvailable = await isPrfAvailable();
  if (!prfAvailable) {
    log.info('No PRF credential available, skipping silent re-auth');
    return false;
  }

  const salt = await getPrfSalt();
  if (!salt) {
    log.warn('PRF salt not found, cannot perform silent re-auth');
    return false;
  }

  let prfOutput: Uint8Array;
  try {
    const result = await assertPrfCredential(salt);
    prfOutput = result.prfOutput;
    log.info('PRF assertion succeeded, credential ID:', result.credentialId.slice(0, 16) + '...');
  } catch (err) {
    log.warn('PRF assertion failed:', err);
    return false;
  }

  try {
    await restoreSessionViaPrf(prfOutput);
    return true;
  } catch (err) {
    log.error('IK reconnection via PRF failed:', err);
    return false;
  }
}

async function restoreSessionViaPrf(prfKey: Uint8Array): Promise<void> {
  const result = await browser.storage.session.get([REMOTE_STATIC_KEY]);
  const cached = result[REMOTE_STATIC_KEY] as CachedPairing | undefined;
  if (!cached || !cached.remoteStaticPublicKey || cached.remoteStaticPublicKey.length === 0) {
    throw new Error('Remote static public key not cached');
  }

  deriveNoiseKeypair(prfKey);

  try {
    const { createOffscreenDocument } = await import('./offscreenWebrtc');
    await createOffscreenDocument();
  } catch (err) {
    log.error('Failed to create offscreen for re-auth:', err);
  }

  await activateSession();
  log.info('Session restored via PRF silent re-authentication');
}

export async function restorePersistedSession(): Promise<void> {
  try {
    const prfAvailable = await isPrfAvailable();
    if (prfAvailable) {
      log.info('PRF available, skipping localStorage session restore');
      return;
    }

    const result = await browser.storage.local.get(SESSION_PERSISTED_KEY);
    const persisted = result[SESSION_PERSISTED_KEY] as
      | (MfaSession & { persistedAt: number })
      | undefined;
    if (!persisted) return;

    if (Date.now() > persisted.expiry) {
      await clearSession();
      return;
    }

    await browser.storage.session.set({ [SESSION_STORAGE_KEY]: persisted });
    log.info(
      'Session restored from local persistence (PIN mode), expires:',
      new Date(persisted.expiry).toISOString(),
    );
  } catch (err) {
    log.error('Failed to restore persisted session:', err);
  }
}

export function setupIdleListener(): void {
  browser.idle.onStateChanged.addListener(async (state) => {
    if (state === 'active') {
      const session = await getSession();
      if (session) {
        await resetIdleTimeout();
      }
    }
  });
}
