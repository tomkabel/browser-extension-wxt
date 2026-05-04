import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { registerMessageHandlers } from './messageHandlers';
import { registerKeepalivePort } from './offscreenWebrtc';
import { initializeAttestation } from './attestationManager';
import {
  setupAlarmListener,
  setupIdleListener,
  restorePersistedSession,
  performSilentReauth,
} from './sessionManager';
import { log } from '~/lib/errors';
import { startWebRequestCapture } from '~/lib/tlsBinding';

async function tryRestoreSession(): Promise<void> {
  const reauthOk = await performSilentReauth();
  if (!reauthOk) {
    await restorePersistedSession();
  }
}

export default defineBackground({
  main() {
    registerMessageHandlers();
    initializeAttestation();
    startWebRequestCapture();
    setupAlarmListener();
    setupIdleListener();

    browser.runtime.onConnect.addListener((port) => {
      if (port.name === 'webrtc-keepalive') {
        log.info('[Background] WebRTC keepalive port connected');
        registerKeepalivePort(port);
      }
    });

    browser.runtime.onInstalled.addListener(async (details) => {
      log.info('Extension installed:', details.reason);
      await tryRestoreSession();
    });

    browser.runtime.onStartup.addListener(async () => {
      log.info('Service worker starting');
      registerMessageHandlers();
      await tryRestoreSession();
    });

    log.info('Background service worker ready');
  },
});
