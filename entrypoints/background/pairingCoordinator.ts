import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';
import {
  createXXHandshake,
  encryptMessage,
  decryptMessage,
  generateKeyPair,
  createNoiseSession,
} from '~/lib/channel/noise';
import type { NoiseSession, ProtocolCapabilities } from '~/lib/channel/noise';
import {
  encodeCapabilities,
  decodeCapabilities,
  intersectCapabilities,
  CURRENT_PROTOCOL_VERSION,
  SUPPORTED_FEATURES,
  SUPPORTED_TRANSPORTS,
} from '~/lib/channel/noiseTypes';
import { completePairing, clearPairing } from './pairingService';
import { createCommandClient, type CommandClient } from '~/lib/channel/commandClient';
import { deriveEmojiSas } from '~/lib/channel/emojiSas';
import { checkPrfSupport, generatePrfSalt } from '~/lib/crypto/fallbackAuth';

const PROTOCOL_VERSION = new Uint8Array([0x01]);
const MESSAGE_HANDSHAKE = new Uint8Array([0x00]);
const MESSAGE_DATA = new Uint8Array([0x01]);
const MESSAGE_CAPABILITIES = new Uint8Array([0x02]);

const EMOJI_SAS_STORAGE_KEY = 'pairing:emojiSas';

let currentSession: NoiseSession | null = null;
let pendingMessages: Uint8Array[] = [];
let commandClient: CommandClient | null = null;
let pendingRemoteStaticPk: Uint8Array | null = null;
let negotiatedCaps: ProtocolCapabilities | null = null;

function sendViaDataChannel(data: Uint8Array): void {
  browser.runtime
    .sendMessage({
      type: 'webrtc-send',
      payload: { data: Array.from(data) },
    })
    .catch(() => {});
}

function processIncomingMessage(data: ArrayBuffer): void {
  const bytes = new Uint8Array(data);
  if (bytes.length < 2) return;

  const protocolByte = bytes[0];
  if (protocolByte !== PROTOCOL_VERSION[0]) return;

  const messageType = bytes[1];
  const content = bytes.subarray(2);

  if (messageType === MESSAGE_HANDSHAKE[0]) {
    log.info('[Coordinator] Received handshake message, length:', content.length);
  } else if (messageType === MESSAGE_CAPABILITIES[0]) {
    const remoteCaps = decodeCapabilities(content);
    if (remoteCaps) {
      negotiatedCaps = intersectCapabilities(
        { version: CURRENT_PROTOCOL_VERSION, features: SUPPORTED_FEATURES, supportedTransports: SUPPORTED_TRANSPORTS },
        remoteCaps,
      );
      log.info('[Coordinator] Negotiated capabilities:', negotiatedCaps);
      if (currentSession) {
        currentSession.remoteCapabilities = remoteCaps;
      }
    }
  } else if (messageType === MESSAGE_DATA[0] && currentSession) {
    try {
      const decrypted = decryptMessage(currentSession, content);
      const plaintext = new TextDecoder().decode(decrypted);
      commandClient?.handleIncomingResponse(plaintext);
    } catch (err) {
      log.error('[Coordinator] Decryption failed:', err);
    }
  }
}

interface HandshakeResult {
  session: NoiseSession;
  emojiSas: [string, string, string];
  capabilities: ProtocolCapabilities;
}

async function performXXHandshake(): Promise<HandshakeResult | null> {
  const localKey = generateKeyPair();
  const handshake = createXXHandshake(localKey);
  let remoteStaticPk: Uint8Array | null = null;

  try {
    commandClient = createCommandClient(
      async (encoded: string) => {
        if (!currentSession) return;
        const encrypted = encryptMessage(currentSession, new TextEncoder().encode(encoded));
        const framed = new Uint8Array(2 + encrypted.length);
        framed.set(PROTOCOL_VERSION, 0);
        framed.set(MESSAGE_DATA, 1);
        framed.set(encrypted, 2);
        sendViaDataChannel(framed);
      },
      { sign: async (data: string) => data },
      { rotate: async () => {} },
      {
        onTransportDead: async (reason: string) => {
          log.warn(`[Coordinator] Transport dead: ${reason}`);
          try {
            const { getTransportManager, initializeTransportManager } = await import('./messageHandlers');
            await initializeTransportManager();
            const tm = getTransportManager();
            if (tm) {
              await tm.switchTransport('usb', reason);
            }
          } catch {
            log.error('[Coordinator] Failed to switch transport on heartbeat failure');
          }
        },
      },
    );
    await browser.storage.session.set({ 'cmd:commandClient': true });

    const capsBytes = encodeCapabilities();

    const { packet: msg1 } = handshake.writeMessage(capsBytes);

    const framed1 = new Uint8Array(3 + msg1.length);
    framed1.set(PROTOCOL_VERSION, 0);
    framed1.set(MESSAGE_HANDSHAKE, 1);
    framed1.set(new Uint8Array([msg1.length >> 8, msg1.length & 0xff]), 2);
    framed1.set(msg1, 3);
    sendViaDataChannel(framed1);

    const msg2 = await waitForDataChannelMessage(15000);
    if (!msg2) return null;

    const msg2Content = msg2.subarray(3);
    const { message: msg2Payload, finished: msg2Done } = handshake.readMessage(msg2Content);

    remoteStaticPk = handshake.remoteStaticPublicKey;

    const remoteCaps = decodeCapabilities(msg2Payload);
    const localCaps: ProtocolCapabilities = {
      version: CURRENT_PROTOCOL_VERSION,
      features: SUPPORTED_FEATURES,
      supportedTransports: SUPPORTED_TRANSPORTS,
    };
    negotiatedCaps = remoteCaps
      ? intersectCapabilities(localCaps, remoteCaps)
      : {
          version: CURRENT_PROTOCOL_VERSION,
          features: [],
          supportedTransports: [],
        };

    if (!remoteStaticPk) {
      log.error('[Coordinator] Responder static key not extracted during handshake');
      return null;
    }

    const { packet: msg3, finished: done3 } = handshake.writeMessage(msg2Payload);
    const framed3 = new Uint8Array(3 + msg3.length);
    framed3.set(PROTOCOL_VERSION, 0);
    framed3.set(MESSAGE_HANDSHAKE, 1);
    framed3.set(new Uint8Array([msg3.length >> 8, msg3.length & 0xff]), 2);
    framed3.set(msg3, 3);
    sendViaDataChannel(framed3);

    if (!done3) {
      log.error('[Coordinator] XX handshake did not complete after message 3');
      return null;
    }

    const transport = done3;
    const session = createNoiseSession(transport, localKey, remoteStaticPk, 'XX');
    if (remoteCaps) {
      session.remoteCapabilities = remoteCaps;
    }

    const chainingKey = new Uint8Array(handshake.chainingKey);
    const emojiSas = await deriveEmojiSas(chainingKey);

    pendingRemoteStaticPk = remoteStaticPk;

    await browser.storage.session.set({
      [EMOJI_SAS_STORAGE_KEY]: emojiSas,
    });

    log.info(
      '[Coordinator] Handshake complete. Protocol version:',
      negotiatedCaps?.version ?? 1,
      'Features:',
      negotiatedCaps?.features.join(', ') ?? 'none',
    );

    return {
      session,
      emojiSas,
      capabilities: negotiatedCaps ?? {
        version: CURRENT_PROTOCOL_VERSION,
        features: [],
        supportedTransports: [],
      },
    };
  } catch (err) {
    log.error('[Coordinator] XX handshake failed:', err);
    return null;
  }
}

function waitForDataChannelMessage(timeoutMs: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    function onRuntimeMessage(message: unknown): void {
      const msg = message as { type?: string; payload?: { data?: number[] } } | undefined;
      if (msg?.type === 'webrtc-data-received' && msg.payload?.data) {
        const bytes = new Uint8Array(msg.payload.data);
        if (
          bytes.length >= 3 &&
          bytes[0] === PROTOCOL_VERSION[0] &&
          bytes[1] === MESSAGE_HANDSHAKE[0]
        ) {
          cleanup();
          resolve(bytes);
        }
      }
    }

    function cleanup(): void {
      clearTimeout(timer);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    }

    browser.runtime.onMessage.addListener(onRuntimeMessage);
  });
}

export async function startPairingFlow(sasCode: string): Promise<void> {
  log.info('[Coordinator] Starting pairing flow with SAS:', sasCode);

  pendingMessages = [];

  const result = await performXXHandshake();

  if (result) {
    currentSession = result.session;
    log.info('[Coordinator] Handshake complete, awaiting SAS confirmation');
  } else {
    log.error('[Coordinator] Pairing failed');
    await clearPairing();
  }
}

export async function disconnectSession(): Promise<void> {
  currentSession = null;
  pendingMessages = [];
  negotiatedCaps = null;
}

export function handleDataChannelOpen(): void {
  for (const msg of pendingMessages) {
    sendViaDataChannel(msg);
  }
  pendingMessages = [];
}

export function handleDataChannelMessage(data: ArrayBuffer): void {
  processIncomingMessage(data);
}

export function getSession(): NoiseSession | null {
  return currentSession;
}

export function getCommandClient(): CommandClient | null {
  return commandClient;
}

export function getNegotiatedCapabilities(): ProtocolCapabilities | null {
  return negotiatedCaps;
}

export async function confirmSasMatch(): Promise<boolean> {
  if (!pendingRemoteStaticPk) {
    log.error('[Coordinator] No pending remote key for SAS confirmation');
    return false;
  }

  try {
    await completePairing(pendingRemoteStaticPk);

    if (currentSession) {
      await browser.storage.session.remove(EMOJI_SAS_STORAGE_KEY);

      if (commandClient) {
        try {
          const encoded = new TextEncoder().encode(
            JSON.stringify({ type: 'pairing-confirmed', caps: negotiatedCaps }),
          );
          const encrypted = encryptMessage(currentSession, encoded);
          const framed = new Uint8Array(2 + encrypted.length);
          framed.set(PROTOCOL_VERSION, 0);
          framed.set(MESSAGE_DATA, 1);
          framed.set(encrypted, 2);
          sendViaDataChannel(framed);
        } catch (err) {
          log.error('[Coordinator] Failed to send pairing-confirmed:', err);
        }
      }

      try {
        const authUrl = chrome.runtime.getURL('auth.html?mode=passkey-create');
        await browser.tabs.create({ url: authUrl, active: false });
        log.info('[Coordinator] Opened passkey creation page');
      } catch (err) {
        log.warn('[Coordinator] Failed to open passkey creation page:', err);
        await fallbackToPrfOnly(pendingRemoteStaticPk);
        pendingRemoteStaticPk = null;
      }

      return true;
    }

    pendingRemoteStaticPk = null;
    return true;
  } catch (err) {
    log.error('[Coordinator] SAS confirmation failed:', err);
    return false;
  }
}

export async function rejectSasMatch(): Promise<void> {
  log.info('[Coordinator] SAS rejected by user, aborting pairing');
  pendingRemoteStaticPk = null;
  negotiatedCaps = null;
  await browser.storage.session.remove(EMOJI_SAS_STORAGE_KEY);
  await clearPairing();
}

async function fallbackToPrfOnly(remoteStaticPk: Uint8Array): Promise<void> {
  log.info('[Coordinator] Falling back to PRF-only re-auth');
  if (!checkPrfSupport()) {
    log.warn('[Coordinator] PRF not supported, skipping');
    return;
  }
  try {
    const salt = await generatePrfSalt(remoteStaticPk);
    const saltBase64 = btoa(String.fromCharCode(...Array.from(salt)));
    const authUrl = chrome.runtime.getURL(
      `auth.html?mode=prf-create&salt=${encodeURIComponent(saltBase64)}`,
    );
    await browser.tabs.create({ url: authUrl, active: false });
    log.info('[Coordinator] Opened PRF credential creation page (fallback)');
  } catch (err) {
    log.warn('[Coordinator] PRF fallback failed:', err);
  }
}

export function clearPendingRemoteKey(): void {
  pendingRemoteStaticPk = null;
}

export function getPendingRemoteKey(): Uint8Array | null {
  return pendingRemoteStaticPk;
}

export { fallbackToPrfOnly };

export async function transmitCredentialToAndroid(
  credentialId: string,
  publicKeyBytes: Uint8Array,
): Promise<boolean> {
  try {
    const { getTransportManager, initializeTransportManager } = await import('./messageHandlers');
    await initializeTransportManager();
    const tm = getTransportManager();
    if (!tm) {
      log.warn('[Coordinator] No transport available to transmit credential');
      return false;
    }

    const publicKeyB64 = btoa(String.fromCharCode(...Array.from(publicKeyBytes)));
    const message = new TextEncoder().encode(
      JSON.stringify({
        type: 'credential-provision',
        credentialId,
        publicKeyBytes: publicKeyB64,
        protocolVersion: negotiatedCaps?.version ?? CURRENT_PROTOCOL_VERSION,
      }),
    );

    await tm.send(message);
    log.info('[Coordinator] Credential transmitted to Android Vault');
    return true;
  } catch (err) {
    log.error('[Coordinator] Failed to transmit credential:', err);
    return false;
  }
}
