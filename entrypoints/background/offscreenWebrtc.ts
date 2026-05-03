import { log } from '~/lib/errors';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const OFFSCREEN_URL = 'offscreen-webrtc.html';
let keepalivePort: chrome.runtime.Port | null = null;
let offscreenCreated = false;
let connectionState: ConnectionState = 'disconnected';
let connectionError: string | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  if (!offscreenCreated) return false;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

export async function createOffscreenDocument(): Promise<boolean> {
  if (await hasOffscreenDocument()) {
    log.info('[OffscreenWebRTC] Offscreen document already exists');
    return true;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WEB_RTC' as chrome.offscreen.Reason],
      justification: 'WebRTC data channel for SmartID2 pairing',
    });
    offscreenCreated = true;
    connectionState = 'connecting';
    connectionError = null;
    log.info('[OffscreenWebRTC] Offscreen document created');
    return true;
  } catch (err) {
    log.error('[OffscreenWebRTC] Failed to create offscreen document:', err);
    offscreenCreated = false;
    connectionState = 'disconnected';
    return false;
  }
}

export async function closeOffscreenDocument(): Promise<void> {
  if (keepalivePort) {
    keepalivePort.disconnect();
    keepalivePort = null;
  }
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
      offscreenCreated = false;
      connectionState = 'disconnected';
      connectionError = null;
      log.info('[OffscreenWebRTC] Offscreen document closed');
    } catch (err) {
      log.error('[OffscreenWebRTC] Failed to close offscreen document:', err);
    }
  }
}

export function registerKeepalivePort(port: chrome.runtime.Port): void {
  keepalivePort = port;
  log.info('[OffscreenWebRTC] Keepalive port registered');

  port.onDisconnect.addListener(() => {
    log.info('[OffscreenWebRTC] Keepalive port disconnected');
    keepalivePort = null;
  });
}

export function isKeepaliveActive(): boolean {
  return keepalivePort !== null;
}

export function updateConnectionState(
  state: ConnectionState,
  error?: string,
): void {
  connectionState = state;
  if (error !== undefined) {
    connectionError = error;
  }
  log.info(`[OffscreenWebRTC] Connection state: ${state}${error ? ` (${error})` : ''}`);
}

export function getConnectionState(): ConnectionState {
  return connectionState;
}

export function getConnectionError(): string | null {
  return connectionError;
}

export function setConnectionError(error: string | null): void {
  connectionError = error;
}
