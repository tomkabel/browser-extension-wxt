import { browser } from 'wxt/browser';
import { TabStateManager } from './tabState';
import { ApiRelay } from './apiRelay';
import {
  createOffscreenDocument,
  closeOffscreenDocument,
  isKeepaliveActive,
  updateConnectionState,
  getConnectionState,
  setConnectionError,
} from './offscreenWebrtc';
import { startPairing } from './pairingService';
import {
  activateSession,
  getSession,
  performSilentReauth,
  setPrfSalt,
  setPrfAvailable,
} from './sessionManager';
import {
  confirmSasMatch,
  rejectSasMatch,
  getCommandClient,
  clearPendingRemoteKey,
  getPendingRemoteKey,
  fallbackToPrfOnly,
} from './pairingCoordinator';
import { cachePrfCredentialId, getCachedPrfCredentialId } from '~/lib/crypto/fallbackAuth';
import { withTimeout } from '~/lib/asyncUtils';
import { createSlidingWindowLimiter, createDomainRateLimiter } from '~/lib/rateLimit/slidingWindow';
import { checkAndReserveAssertion } from '~/lib/replayProtection';
import { TransportManager } from '~/lib/transport';
import { getAttestationStatus, refreshRpKeys, getDomCode } from './attestationManager';
import {
  deriveChallenge,
  generateSessionNonce,
  serializeChallengeComponents,
} from '~/lib/webauthn';
import {
  startWebRequestCapture,
  getTlsBindingComponents,
  buildChallengeProof,
} from '~/lib/tlsBinding';
import { isDomainApproved } from './contentScriptManager';
import type {
  AttestedCodePayload,
  CredentialRequestPayload,
  LoginFormDetection,
  MessageType,
  TransactionData,
  UnapprovedLoginForm,
} from '~/types';
import { sortedJsonStringify } from '~/lib/attestation';
import { log } from '~/lib/errors';
import {
  addPendingDomain,
  removePendingDomain,
  getPendingDomains,
  getApprovedDomains,
  isDomainDeniedInSession,
  addDeniedDomain,
  registerForDomain,
} from './contentScriptManager';
import { transmitCredentialToAndroid } from './pairingCoordinator';
import {
  listDevices,
  getActiveDeviceId,
  setActiveDevice,
  revokeDevice,
  getDevice,
} from './deviceRegistry';
import type { DeviceMeta } from '~/types';

type MessageHandler = (
  payload: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse>;

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const TIMEOUT_MS = 10_000;

async function timedTransportSend(tm: TransportManager, message: Uint8Array, label: string): Promise<MessageResponse> {
  try {
    await withTimeout(tm.send(message), TIMEOUT_MS, `${label} transport send timed out`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : `${label} failed`;
    if (errorMessage.includes('timed out')) {
      log.warn(`${label} timed out`);
    }
    return { success: false, error: errorMessage };
  }
}

const VALID_QES_STATES = new Set(['idle', 'armed', 'waiting', 'executing', 'completed', 'cancelled', 'timeout']);

function validateQesPayload(payload: unknown): { valid: boolean; state?: string; error?: string } {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'invalid_payload' };
  const p = payload as Record<string, unknown>;
  if (typeof p.state !== 'string' || !VALID_QES_STATES.has(p.state)) {
    return { valid: false, error: 'invalid_payload: state must be a valid QesState' };
  }
  if (p.sessionId != null && typeof p.sessionId !== 'string') return { valid: false, error: 'invalid_payload: sessionId must be string' };
  if (p.countdownSeconds != null && typeof p.countdownSeconds !== 'number') return { valid: false, error: 'invalid_payload: countdownSeconds must be number' };
  if (p.result != null && typeof p.result !== 'string') return { valid: false, error: 'invalid_payload: result must be string' };
  if (p.interruptType != null && typeof p.interruptType !== 'string') return { valid: false, error: 'invalid_payload: interruptType must be string' };
  if (p.auditEntry != null && typeof p.auditEntry !== 'string') return { valid: false, error: 'invalid_payload: auditEntry must be string' };
  if (p.timestamp != null && typeof p.timestamp !== 'number') return { valid: false, error: 'invalid_payload: timestamp must be number' };
  return { valid: true, state: p.state };
}

const handlers: Partial<Record<MessageType, MessageHandler>> = {
  'tab-domain-changed': async (payload, sender) => {
    const { url } = payload as { domain: string; url: string };
    const tabId = sender.tab?.id;

    if (!tabId) {
      return { success: false, error: 'Cannot identify sender tab' };
    }

    const updated = await TabStateManager.updateTabDomain(tabId, url);
    return { success: true, data: { updated } };
  },

  'get-current-domain': async (_, sender) => {
    const tabId = await getTabIdFromSender(sender);
    if (!tabId) {
      return { success: false, error: 'No active tab' };
    }

    const domain = await TabStateManager.getTabDomain(tabId);
    if (!domain) {
      return { success: false, error: 'No domain recorded for this tab' };
    }

    return { success: true, data: domain };
  },

  'send-to-api': async (payload) => {
    const { content, metadata } = payload as {
      content: Record<string, unknown>;
      metadata: { domain: string; url: string; timestamp: number };
    };

    const result = await ApiRelay.send(content, metadata);
    return result;
  },

  'check-api-health': async () => {
    const result = await ApiRelay.healthCheck();
    return result;
  },

  'webrtc-create-offscreen': async () => {
    const created = await createOffscreenDocument();
    return { success: created, data: { created } };
  },

  'webrtc-close-offscreen': async () => {
    await closeOffscreenDocument();
    return { success: true };
  },

  'webrtc-keepalive-status': async () => {
    return { success: true, data: { active: isKeepaliveActive() } };
  },

  'webrtc-connection-state': async (payload) => {
    const { state } = payload as { state: string; previous: string };
    const stateMap: Record<string, 'disconnected' | 'connecting' | 'connected' | 'reconnecting'> = {
      new: 'connecting',
      connecting: 'connecting',
      connected: 'connected',
      disconnected: 'reconnecting',
      failed: 'reconnecting',
      closed: 'disconnected',
    };
    const mappedState = stateMap[state] ?? 'disconnected';
    updateConnectionState(mappedState);
    return { success: true };
  },

  'webrtc-connection-timeout': async () => {
    updateConnectionState('disconnected');
    setConnectionError('Connection timed out');
    return { success: true };
  },

  'get-connection-state': async () => {
    return {
      success: true,
      data: {
        connectionState: getConnectionState(),
        connectionError: null,
      },
    };
  },

  'start-pairing': async (payload) => {
    const { sasCode, nonce } = payload as {
      sasCode: string;
      pairingUrl: string;
      nonce?: number[];
    };
    if (!sasCode || !/^\d{6}$/.test(sasCode)) {
      return { success: false, error: 'Invalid SAS code' };
    }

    const nonceBytes = nonce ? new Uint8Array(nonce) : undefined;
    const result = await startPairing(sasCode, nonceBytes);
    return result;
  },

  'detect-transaction': async (payload, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId) {
      return { success: false, error: 'No sender tab' };
    }

    try {
      const response = await withTimeout(
        browser.tabs.sendMessage(tabId, {
          type: 'detect-transaction',
          payload,
        }),
        5000,
        'Transaction detection timed out',
      );
      return response;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Detection failed' };
    }
  },

  'check-session': async () => {
    await performSilentReauth();

    const stored = await browser.storage.session.get('pairing:device');
    const paired = !!stored['pairing:device'];

    const emojiSasStored = await browser.storage.session.get('pairing:emojiSas');
    const emojiSas = emojiSasStored['pairing:emojiSas'];

    const session = await getSession();

    return {
      success: true,
      data: {
        paired,
        active: !!session,
        expiry: session?.expiry,
        deviceName: session?.deviceName,
        emojiSas: emojiSas ?? null,
        connectionState: getConnectionState(),
      },
    };
  },

  'pairing-confirmed': async () => {
    const ok = await confirmSasMatch();
    return { success: ok, error: ok ? undefined : 'Confirmation internal error' };
  },

  'pairing-rejected': async () => {
    await rejectSasMatch();
    return { success: true };
  },

  'verify-transaction': async (payload) => {
    const tx = payload as TransactionData;
    if (!tx.amount && !tx.recipient) {
      return { success: false, error: 'No transaction data to verify' };
    }

    try {
      const stored = await browser.storage.session.get('cmd:commandClient');
      const clientReady = stored['cmd:commandClient'] as boolean | undefined;

      if (!clientReady) {
        return {
          success: false,
          error: 'Command client not initialized. Pair with your phone first.',
        };
      }

      const client = getCommandClient();
      if (!client) {
        return { success: false, error: 'Command client not ready' };
      }

      const response = await withTimeout(
        client.sendAuthenticateTransaction({
          amount: tx.amount,
          recipient: tx.recipient,
          timestamp: Date.now(),
        }),
        10_000,
        'Transaction verification timed out',
      );

      return {
        success: true,
        data: {
          verdict: response.status === 'confirmed' ? 'confirmed' : 'rejected',
          transaction: { amount: tx.amount, recipient: tx.recipient },
          confirmedAt: Date.now(),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Verification failed' };
    }
  },

  'mfa-assertion': async (payload) => {
    const { credentialId, authenticatorData, clientDataJSON, signature } = payload as {
      credentialId: string;
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
      userHandle: string | null;
    };

    if (!credentialId || !authenticatorData || !clientDataJSON || !signature) {
      return { success: false, error: 'Missing assertion data' };
    }

    if (!mfaRateLimiter.allow()) {
      return { success: false, error: 'Rate limited. Try again later.' };
    }

    const assertionTuple = `${credentialId}:${clientDataJSON}:${authenticatorData}`;
    if (await checkAndReserveAssertion(assertionTuple)) {
      return { success: false, error: 'Assertion replay detected' };
    }

    const session = await activateSession();
    return {
      success: true,
      data: {
        sessionToken: session.sessionToken,
        expiry: session.expiry,
      },
    };
  },

  'prf-credential-created': async (payload) => {
    const { credentialId, prfEnabled, prfSalt } = payload as {
      credentialId: string;
      prfEnabled: boolean;
      prfSalt: number[];
    };

    if (!prfEnabled) {
      log.info('PRF credential created but PRF extension was not enabled');
      return { success: false, error: 'PRF not enabled on credential' };
    }

    await cachePrfCredentialId(credentialId);
    await setPrfSalt(new Uint8Array(prfSalt));
    await setPrfAvailable();

    log.info('PRF credential cached:', credentialId.slice(0, 16) + '...');
    return { success: true, data: { credentialId } };
  },

  'detect-login-form': async (payload, sender) => {
    const detection = payload as LoginFormDetection;
    if (!detection.domain || !detection.usernameSelector || !detection.passwordSelector) {
      return { success: false, error: 'Incomplete login form detection data' };
    }

    const tabId = sender.tab?.id;
    if (!tabId) return { success: false, error: 'No sender tab' };

    const key = `credential:selectors:${tabId}`;
    await browser.storage.session.set({
      [key]: {
        usernameSelector: detection.usernameSelector,
        passwordSelector: detection.passwordSelector,
        tabId,
      },
    });

    log.info('Login form detected on', detection.domain);

    if (!credentialRateLimiter.allow(detection.domain)) {
      return { success: true, data: { ...detection, rateLimited: true } };
    }

    try {
      const client = getCommandClient();
      if (!client) {
        return { success: true, data: { ...detection, clientReady: false } };
      }

      const response = await withTimeout(
        client.sendCredentialRequest(
          detection.domain,
          detection.url,
          detection.usernameSelector,
          detection.passwordSelector,
        ),
        10_000,
        'Credential request timed out',
      );

      const credStatus = (response.data?.status as string) || 'error';

      if (credStatus === 'found' && response.data?.username && response.data?.password) {
        const credBuffer = new TextEncoder().encode(response.data.password as string);

        await withTimeout(
          browser.tabs.sendMessage(tabId, {
            type: 'credential-response',
            payload: {
              username: response.data.username,
              password: response.data.password,
            },
          }),
          5000,
          'Credential response timed out',
        );

        credBuffer.fill(0);
      }

      return {
        success: true,
        data: { status: credStatus, approval_mode: response.data?.approval_mode },
      };
    } catch (err) {
      return {
        success: true,
        data: { error: err instanceof Error ? err.message : 'Request failed' },
      };
    }
  },

  'credential-request': async (payload) => {
    const { domain, url, usernameFieldId, passwordFieldId } = payload as CredentialRequestPayload;

    if (!domain || !url) {
      return { success: false, error: 'Missing domain or URL in credential request' };
    }

    if (!credentialRateLimiter.allow(domain)) {
      return { success: false, error: 'Rate limited. Try again later.' };
    }

    try {
      const client = getCommandClient();
      if (!client) {
        return { success: false, error: 'Command client not connected' };
      }

      const response = await withTimeout(
        client.sendCredentialRequest(domain, url, usernameFieldId, passwordFieldId),
        10_000,
        'Credential request timed out',
      );

      return {
        success: true,
        data: {
          status: response.data?.status,
          approval_mode: response.data?.approval_mode,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Credential request failed',
      };
    }
  },

  'transport-changed': async () => {
    if (!transportManager) {
      return { success: true, data: { activeTransport: null, usbAvailable: false } };
    }
    return {
      success: true,
      data: {
        activeTransport: transportManager.getActiveTransportType(),
        usbAvailable: transportManager.isUsbAvailable(),
      },
    };
  },

  'get-attestation-status': async () => {
    return { success: true, data: { status: getAttestationStatus() } };
  },

  'refresh-rp-keys': async () => {
    return refreshRpKeys();
  },

  'passkey-credential-created': async (payload) => {
    const { credentialId, publicKeyBytes, prfEnabled, prfSalt } = payload as {
      credentialId: string;
      publicKeyBytes: number[];
      prfEnabled: boolean;
      prfSalt?: number[];
    };

    log.info('Passkey credential created:', credentialId.slice(0, 16) + '...');

    const transmitted = await transmitCredentialToAndroid(
      credentialId,
      new Uint8Array(publicKeyBytes),
    );

    if (!transmitted) {
      log.warn('Credential public key transmission failed');
    }

    if (prfEnabled) {
      try {
        await cachePrfCredentialId(credentialId);
        if (prfSalt) {
          await setPrfSalt(new Uint8Array(prfSalt));
        }
        log.info('PRF credential cached from passkey provisioning');
      } catch (err) {
        log.warn('Failed to cache PRF credential:', err);
      }
    }

    clearPendingRemoteKey();
    return { success: transmitted, data: { credentialId, transmitted } };
  },

  'passkey-credential-error': async (payload) => {
    const { error } = payload as { error: string };
    log.warn('Passkey credential creation failed:', error);

    const remotePk = getPendingRemoteKey();
    if (remotePk) {
      log.info('Attempting PRF-only fallback after passkey creation failure');
      await fallbackToPrfOnly(remotePk);
      clearPendingRemoteKey();
    }

    return { success: false, error: 'Passkey creation failed, PRF-only fallback activated' };
  },

  'get-cached-credential-id': async () => {
    const credentialId = await getCachedPrfCredentialId();
    if (!credentialId) {
      return { success: false, error: 'No cached credential' };
    }
    const rawId = Uint8Array.from(atob(credentialId), (c) => c.charCodeAt(0));
    return { success: true, data: { credentialId, rawId: Array.from(rawId) } };
  },

  'check-domain-approved': async (payload) => {
    const { domain } = payload as { domain: string };
    const approved = await isDomainApproved(domain);
    return { success: true, data: { approved } };
  },

  'begin-challenge-assertion': async (payload, sender) => {
    const { amount, recipient } = payload as { amount?: string | null; recipient?: string | null };

    if (authInProgress) {
      return { success: false, error: 'Authentication already in progress' };
    }

    if (!sender.tab?.id) {
      return { success: false, error: 'No sender tab' };
    }
    authInProgress = true;
    const tabId = sender.tab.id;

    try {
      if (!sender.tab.url) {
        return { success: false, error: 'Cannot determine origin from sender tab' };
      }
      const origin = new URL(sender.tab.url).origin;
      if (!origin || origin === 'null') {
        return { success: false, error: 'Cannot determine origin from sender tab' };
      }

      const controlCode = await getDomCode(tabId);

      let pageContent = '';
      try {
        const domResponse = await withTimeout(
          browser.tabs.sendMessage(tabId, { type: 'scrape-control-code', payload: {} }),
          2000,
          'Page content request timed out',
        );
        if (domResponse?.success && domResponse?.data?.text) {
          pageContent = domResponse.data.text as string;
        }
      } catch {
        pageContent = sender.tab?.url ?? '';
      }
      const tlsBindingHash = await buildChallengeProof(tabId, controlCode ?? '0000', pageContent);

      const sessionNonce = generateSessionNonce();

      const tlvComponents = serializeChallengeComponents({
        tlsBinding: tlsBindingHash,
        origin,
        controlCode: controlCode ?? '0000',
        sessionNonce,
      });

      const rpId = chrome.runtime.id;

      const derivedChallenge = await deriveChallenge({
        tlsBinding: tlsBindingHash,
        origin,
        controlCode: controlCode ?? '0000',
        sessionNonce,
      });

      const tlsBinding = await getTlsBindingComponents(tabId, controlCode ?? '0000', pageContent);

      await browser.storage.session.set({
        'pending:assertion': {
          derivedChallenge: Array.from(derivedChallenge),
          tlvComponents: Array.from(tlvComponents),
          sessionNonce: Array.from(sessionNonce),
          origin,
          controlCode: controlCode ?? '0000',
          rpId,
          secFetchSite: tlsBinding.secFetchSite,
          contentHash: tlsBinding.contentHash,
          transactionData: { amount: amount ?? null, recipient: recipient ?? null },
        },
      });

      const challengeB64 = btoa(String.fromCharCode(...Array.from(derivedChallenge)));
      const authUrl = chrome.runtime.getURL(
        `auth.html?mode=challenge-assert&challenge=${encodeURIComponent(challengeB64)}`,
      );
      const tab = await browser.tabs.create({ url: authUrl, active: false });
      authTabId = tab.id ?? null;

      clearAuthTimeout();
      authTimeoutHandle = setTimeout(() => {
        if (authInProgress) {
          resetAuthInProgress('timeout');
        }
      }, AUTH_TIMEOUT_MS);

      return {
        success: true,
        data: { status: 'pending', origin, controlCode: controlCode ?? '0000' },
      };
    } catch (err) {
      log.error('Failed to begin challenge assertion:', err);
      resetAuthInProgress('begin-challenge-assertion error');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Assertion initiation failed',
      };
    }
  },

  'login-form-detected-unapproved': async (payload, sender) => {
    const detection = payload as UnapprovedLoginForm;
    if (!detection.domain || !detection.usernameSelector || !detection.passwordSelector) {
      return { success: false, error: 'Incomplete login form detection data' };
    }

    const tabId = sender.tab?.id;
    if (!tabId) return { success: false, error: 'No sender tab' };

    if (await isDomainDeniedInSession(detection.domain)) {
      return { success: true, data: { ignored: true } };
    }

    await addPendingDomain(detection.domain, detection.url, tabId, {
      usernameSelector: detection.usernameSelector,
      passwordSelector: detection.passwordSelector,
    });

    log.info('[BG] Unapproved domain detected:', detection.domain);
    return { success: true, data: { pending: true } };
  },

  'domain-approved': async (payload) => {
    const { domain } = payload as { domain: string };
    try {
      await registerForDomain(domain);
      await removePendingDomain(domain);
      log.info('[BG] Domain approved:', domain);
      return { success: true, data: { domain } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Registration failed' };
    }
  },

  'domain-denied': async (payload) => {
    const { domain } = payload as { domain: string };
    await addDeniedDomain(domain);
    await removePendingDomain(domain);
    log.info('[BG] Domain denied:', domain);
    return { success: true, data: { domain } };
  },

  'get-approved-domains': async () => {
    const domains = await getApprovedDomains();
    return { success: true, data: { domains } };
  },

  'get-pending-domains': async () => {
    const pending = await getPendingDomains();
    return { success: true, data: { pending } };
  },

  'get-devices': async () => {
    const devices = await listDevices();
    const activeId = await getActiveDeviceId();
    const deviceMetas: (DeviceMeta & { isActive: boolean })[] = devices.map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      lastSeen: d.lastSeen,
      pairedAt: d.pairedAt,
      isPrimary: d.isPrimary,
      isActive: d.deviceId === activeId,
    }));
    return { success: true, data: { devices: deviceMetas } };
  },

  'switch-device': async (payload) => {
    const { deviceId } = payload as { deviceId: string };
    try {
      const device = await getDevice(deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }

      const previousDeviceId = await getActiveDeviceId();

      if (transportManager) {
        try {
          await transportManager.destroy();
        } catch {
          log.warn('[switch-device] Error destroying current transport');
        }
        transportManager = null;
        transportManagerInitPromise = null;
      }

      await setActiveDevice(deviceId);

      if (device.phoneStaticKey.length > 0) {
        try {
          await initializeTransportManager();
          log.info('[switch-device] Transport reinitialized for device:', deviceId);
        } catch (err) {
          log.error('[switch-device] Failed to reinitialize transport:', err);
          if (previousDeviceId && previousDeviceId !== deviceId) {
            try {
              await setActiveDevice(previousDeviceId);
            } catch (restoreErr) {
              log.error('[switch-device] Failed to restore previous active device:', restoreErr);
            }
          }
          return { success: false, error: 'Device switched but transport reconnection failed' };
        }
      }

      return { success: true, data: { deviceId } };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to switch device',
      };
    }
  },

  'revoke-device': async (payload) => {
    const { deviceId } = payload as { deviceId: string };
    try {
      const activeId = await getActiveDeviceId();
      await revokeDevice(deviceId);

      if (deviceId === activeId && transportManager) {
        log.info('[revoke-device] Revoked device was active, tearing down transport');
        try {
          await transportManager.destroy();
        } catch {
          log.warn('[revoke-device] Error destroying transport for revoked device');
        }
        transportManager = null;
        transportManagerInitPromise = null;
      }

      return { success: true, data: { deviceId } };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to revoke device',
      };
    }
  },

  'get-active-device-id': async () => {
    const activeId = await getActiveDeviceId();
    return { success: true, data: { activeDeviceId: activeId } };
  },

  'assertion-complete': async (payload) => {
    clearAuthTimeout();
    const data = payload as {
      status: string;
      error?: string;
      credentialId?: string;
      tlvComponents?: number[];
      sessionNonce?: number[];
      origin?: string;
      controlCode?: string;
      authenticatorData?: number[];
      signature?: number[];
      clientDataJSON?: number[];
      rawId?: number[];
    };

    if (data.status !== 'verified') {
      await browser.storage.session.set({
        'assertion:result': { status: data.status, error: data.error ?? 'Assertion failed' },
      });
      resetAuthInProgress('assertion-complete not verified');
      return { success: false, error: data.error ?? 'Assertion failed' };
    }

    if (
      !data.credentialId ||
      !data.tlvComponents ||
      !data.sessionNonce ||
      !data.origin ||
      !data.controlCode ||
      !data.authenticatorData ||
      !data.signature ||
      !data.clientDataJSON
    ) {
      const error = 'Incomplete assertion data';
      await browser.storage.session.set({ 'assertion:result': { status: 'error', error } });
      resetAuthInProgress('assertion-complete incomplete data');
      return { success: false, error };
    }

    try {
      await initializeTransportManager();
      const tm = getTransportManager();

      if (tm) {
        const message = new TextEncoder().encode(
          JSON.stringify({
            type: 'webauthn-assertion',
            credentialId: data.credentialId,
            tlvBytes: data.tlvComponents,
            authenticatorData: data.authenticatorData,
            signature: data.signature,
            clientDataJSON: data.clientDataJSON,
            sessionNonce: data.sessionNonce,
            origin: data.origin,
            controlCode: data.controlCode,
            timestamp: Math.floor(Date.now() / 1000),
          }),
        );

        await tm.send(message);
        log.info('Challenge-bound assertion transmitted to Android Vault');
      } else {
        log.warn('No transport available to transmit assertion to Android');
      }

      await browser.storage.session.set({
        'assertion:result': { status: 'verified' },
      });
      await browser.storage.session.remove('pending:assertion');

      resetAuthInProgress('assertion-complete success');
      return { success: true, data: { status: 'verified' } };
    } catch (err) {
      log.error('Failed to transmit assertion:', err);
      await browser.storage.session.set({
        'assertion:result': {
          status: 'error',
          error: err instanceof Error ? err.message : 'Transmission failed',
        },
      });
      resetAuthInProgress('assertion-complete transmission error');
      return { success: false, error: err instanceof Error ? err.message : 'Transmission failed' };
    }
  },

  'deliver-attested-code': async (payload) => {
    const attPayload = payload as AttestedCodePayload;
    if (
      !attPayload.controlCode ||
      !attPayload.keyId ||
      !attPayload.signature ||
      !attPayload.rpDomain
    ) {
      return { success: false, error: 'Missing required attestation fields' };
    }

    try {
      await initializeTransportManager();
      const tm = getTransportManager();
      if (!tm) {
        return { success: false, error: 'No transport available to deliver attestation' };
      }

      const attestationMessage = new TextEncoder().encode(
        sortedJsonStringify({
          type: 'attestation',
          controlCode: attPayload.controlCode,
          keyId: attPayload.keyId,
          signature: attPayload.signature,
          rpDomain: attPayload.rpDomain,
          sessionId: attPayload.sessionId,
          timestamp: attPayload.timestamp ?? Math.floor(Date.now() / 1000),
        }),
      );

      await tm.send(attestationMessage);
      log.info('Attestation delivered to device via transport');
      return { success: true, data: { delivered: true, rpDomain: attPayload.rpDomain } };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Attestation delivery failed',
      };
    }
  },

  'qes-status-changed': async (payload) => {
    const validation = validateQesPayload(payload);
    if (!validation.valid) {
      log.warn('qes-status-changed rejected:', validation.error);
      return { success: false, error: validation.error };
    }
    const data = payload as { state: string; sessionId?: string; countdownSeconds?: number; result?: string; interruptType?: string; timestamp?: number; auditEntry?: string };
    const qesData = {
      state: data.state,
      sessionId: data.sessionId,
      countdownSeconds: data.countdownSeconds,
      result: data.result,
      interruptType: data.interruptType,
      timestamp: data.timestamp,
      auditEntry: data.auditEntry,
      _updated: Date.now(),
    };
    await browser.storage.session.set({ 'qes:status': qesData });
    return { success: true, data: qesData };
  },

  'get-qes-status': async () => {
    const result = await browser.storage.session.get('qes:status');
    return { success: true, data: result['qes:status'] ?? null };
  },

  'qes-arm': async (payload) => {
    const data = payload as { sessionId: string; transactionHash: string; zkTlsProofHash: string; webauthnAssertionHash: string };
    try {
      await initializeTransportManager();
      const tm = getTransportManager();
      if (!tm) {
        return { success: false, error: 'No transport available' };
      }
      const message = new TextEncoder().encode(JSON.stringify({
        type: 'qes-arm',
        sessionId: data.sessionId,
        transactionHash: data.transactionHash,
        zkTlsProofHash: data.zkTlsProofHash,
        webauthnAssertionHash: data.webauthnAssertionHash,
      }));
      return timedTransportSend(tm, message, 'QES arm');
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to arm QES' };
    }
  },

  'qes-cancel': async () => {
    try {
      await initializeTransportManager();
      const tm = getTransportManager();
      if (!tm) {
        return { success: false, error: 'No transport available' };
      }
      const message = new TextEncoder().encode(JSON.stringify({ type: 'qes-cancel' }));
      return timedTransportSend(tm, message, 'QES cancel');
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel QES' };
    }
  },
};

async function getTabIdFromSender(sender: chrome.runtime.MessageSender): Promise<number | null> {
  if (sender.tab?.id) {
    return sender.tab.id;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

let tlsBindingCaptured = false;

export function registerMessageHandlers(): void {
  if (!tlsBindingCaptured) {
    startWebRequestCapture();
    tlsBindingCaptured = true;
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isValidMessage(message)) {
      sendResponse({ success: false, error: 'Invalid message format' });
      return true;
    }

    const handler = handlers[message.type as MessageType];
    if (!handler) {
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      return true;
    }

    handler(message.payload, sender)
      .then(sendResponse)
      .catch((err: Error) => {
        sendResponse({ success: false, error: err.message });
      });

    return true;
  });
}

function isValidMessage(message: unknown): message is { type: string; payload?: unknown } {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as Record<string, unknown>).type === 'string'
  );
}

let authInProgress = false;
let authTabId: number | null = null;
let authTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

const AUTH_TIMEOUT_MS = 120_000;

function clearAuthTimeout(): void {
  if (authTimeoutHandle !== null) {
    clearTimeout(authTimeoutHandle);
    authTimeoutHandle = null;
  }
}

function resetAuthInProgress(reason: string): void {
  clearAuthTimeout();
  authInProgress = false;
  authTabId = null;
  log.info('[authInProgress] Reset:', reason);
}

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === authTabId) {
    resetAuthInProgress('auth tab closed');
  }
});

const MFA_RATE_LIMIT_WINDOW_MS = 60_000;
const MFA_RATE_LIMIT_MAX = 3;
const mfaRateLimiter = createSlidingWindowLimiter(MFA_RATE_LIMIT_WINDOW_MS, MFA_RATE_LIMIT_MAX);

const CREDENTIAL_RATE_LIMIT_MS = 30_000;
const credentialRateLimiter = createDomainRateLimiter(CREDENTIAL_RATE_LIMIT_MS);

let transportManager: TransportManager | null = null;
let transportManagerInitPromise: Promise<void> | null = null;

export function clearAuthInProgress(): void {
  resetAuthInProgress('clearAuthInProgress');
}

export function getTransportManager(): TransportManager | null {
  return transportManager;
}

export async function initializeTransportManager(): Promise<void> {
  if (transportManagerInitPromise) {
    return transportManagerInitPromise;
  }
  if (transportManager) return;
  transportManager = new TransportManager();
  transportManagerInitPromise = transportManager
    .initialize()
    .catch((err) => {
      transportManager = null;
      throw err;
    })
    .finally(() => {
      transportManagerInitPromise = null;
    });
  return transportManagerInitPromise;
}
