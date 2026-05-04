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
import { confirmSasMatch, rejectSasMatch, getCommandClient } from './pairingCoordinator';
import { cachePrfCredentialId } from '~/lib/crypto/fallbackAuth';
import { withTimeout } from '~/lib/asyncUtils';
import { createSlidingWindowLimiter, createDomainRateLimiter } from '~/lib/rateLimit/slidingWindow';
import { isReplayAssertion, recordAssertion } from '~/lib/replayProtection';
import { TransportManager } from '~/lib/transport';
import { getAttestationStatus, refreshRpKeys } from './attestationManager';
import type {
  AttestedCodePayload,
  CredentialRequestPayload,
  LoginFormDetection,
  MessageType,
  TransactionData,
} from '~/types';
import { sortedJsonStringify } from '~/lib/attestation';
import { log } from '~/lib/errors';

type MessageHandler = (
  payload: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse>;

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
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
    const { sasCode } = payload as { sasCode: string; pairingUrl: string };
    if (!sasCode || !/^\d{6}$/.test(sasCode)) {
      return { success: false, error: 'Invalid SAS code' };
    }

    const result = await startPairing(sasCode);
    return result;
  },

  'detect-transaction': async (payload, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId) {
      return { success: false, error: 'No sender tab' };
    }

    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: 'detect-transaction',
        payload,
      });
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
    if (isReplayAssertion(assertionTuple)) {
      return { success: false, error: 'Assertion replay detected' };
    }

    recordAssertion(assertionTuple);

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

        await browser.tabs.sendMessage(tabId, {
          type: 'credential-response',
          payload: {
            username: response.data.username,
            password: response.data.password,
          },
        });

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
    const { domain, url, usernameFieldId, passwordFieldId } =
      payload as CredentialRequestPayload;

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
    const { credentialId, publicKeyBytes, prfEnabled } = payload as {
      credentialId: string;
      publicKeyBytes: number[];
      prfEnabled: boolean;
    };

    log.info('Passkey credential created:', credentialId.slice(0, 16) + '...');

    const { transmitCredentialToAndroid } = await import('./pairingCoordinator');
    const transmitted = await transmitCredentialToAndroid(
      credentialId,
      new Uint8Array(publicKeyBytes),
    );

    if (!transmitted) {
      log.warn('Credential public key transmission failed, falling back to PRF-only');
    }

    if (prfEnabled) {
      try {
        await cachePrfCredentialId(credentialId);
        log.info('PRF credential cached from passkey provisioning');
      } catch (err) {
        log.warn('Failed to cache PRF credential:', err);
      }
    }

    return { success: transmitted, data: { credentialId, transmitted } };
  },

  'passkey-credential-error': async (payload) => {
    const { error } = payload as { error: string };
    log.warn('Passkey credential creation failed:', error);
    return { success: false, error: 'Passkey creation failed, PRF-only fallback activated' };
  },

  'deliver-attested-code': async (payload) => {
    const attPayload = payload as AttestedCodePayload;
    if (!attPayload.controlCode || !attPayload.keyId || !attPayload.signature || !attPayload.rpDomain) {
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
      return { success: false, error: err instanceof Error ? err.message : 'Attestation delivery failed' };
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

export function registerMessageHandlers(): void {
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

function isValidMessage(
  message: unknown,
): message is { type: string; payload?: unknown } {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as Record<string, unknown>).type === 'string'
  );
}

const MFA_RATE_LIMIT_WINDOW_MS = 60_000;
const MFA_RATE_LIMIT_MAX = 3;
const mfaRateLimiter = createSlidingWindowLimiter(MFA_RATE_LIMIT_WINDOW_MS, MFA_RATE_LIMIT_MAX);

const CREDENTIAL_RATE_LIMIT_MS = 30_000;
const credentialRateLimiter = createDomainRateLimiter(CREDENTIAL_RATE_LIMIT_MS);

let transportManager: TransportManager | null = null;
let transportManagerInitPromise: Promise<void> | null = null;

export function getTransportManager(): TransportManager | null {
  return transportManager;
}

export async function initializeTransportManager(): Promise<void> {
  if (transportManagerInitPromise) {
    return transportManagerInitPromise;
  }
  if (transportManager) return;
  transportManager = new TransportManager();
  transportManagerInitPromise = transportManager.initialize().catch((err) => {
    transportManager = null;
    throw err;
  }).finally(() => {
    transportManagerInitPromise = null;
  });
  return transportManagerInitPromise;
}
