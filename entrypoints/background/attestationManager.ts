import { browser } from 'wxt/browser';
import { KeyStore, WHITELISTED_RP_DOMAINS, createVerifier, refreshKeyManifest, logAuditEvent, AuditEventType, isDemoMode } from '~/lib/attestation';
import type { AttestationStatus } from '~/lib/attestation';
import { log } from '~/lib/errors';
import { withTimeout } from '~/lib/asyncUtils';
import bundledManifest from '~/lib/attestation/trusted-rp-keys.json';

let keyStore: KeyStore | null = null;
let verifier: ReturnType<typeof createVerifier> | null = null;
let currentAttestationStatus: AttestationStatus = { type: 'not_applicable' };

let attestationMutex: Promise<void> = Promise.resolve();

async function withAttestationLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  await attestationMutex;
  attestationMutex = next;
  try {
    return await fn();
  } finally {
    release!();
  }
}

export function getAttestationStatus(): AttestationStatus {
  return currentAttestationStatus;
}

export async function refreshRpKeys(): Promise<{ success: boolean; error?: string }> {
  if (!keyStore) return { success: false, error: 'Attestation not initialized' };
  return refreshKeyManifest(keyStore);
}

export async function initializeAttestation(): Promise<void> {
  if (keyStore) return;

  keyStore = new KeyStore(bundledManifest.keys);
  verifier = createVerifier(keyStore);
  log.info(`Attestation initialized with ${keyStore.keyCount()} trusted keys`);

  setupWebRequestListener();

  if (isDemoMode()) {
    log.info('Running in DEMO mode — attestation headers will be generated locally for testing');
    console.warn(
      '⚠️  DEMO MODE: Attestation private keys are embedded in the extension source. ' +
      'Do NOT distribute this build — demo keys can be extracted to forge attestation headers.',
    );
    const { createDemoAttestationHeader: createHeader } = await import('~/lib/attestation/demoAttestation');
    setupDemoAttestationInjector(createHeader);
  } else {
    refreshKeyManifest(keyStore).then((result) => {
      if (result.success) {
        log.info('Background key manifest refresh succeeded');
      } else {
        log.warn('Background key manifest refresh failed:', result.error);
      }
    });
  }
}

async function setupDemoAttestationInjector(
  createHeader: (code: string, domain: string, keyId: string, sessionId?: string) => Promise<string | null>,
): Promise<void> {
  (browser.webRequest.onBeforeRequest as any).addListener(
    (details: any) => injectDemoAttestation(details, createHeader),
    { urls: WHITELISTED_RP_DOMAINS.map((d) => `*://*.${d}/*`), types: ['main_frame'] },
    [],
  );
  log.info('Demo attestation injector active');
}

function injectDemoAttestation(
  details: any,
  createHeader: (code: string, domain: string, keyId: string, sessionId?: string) => Promise<string | null>,
): void {
  if (!verifier) return;

  const rpDomain = extractRpDomain(details.url);
  if (!rpDomain) return;

  const testCode = String(1000 + Math.floor(Math.random() * 9000));
  const domainPrefixMap: Record<string, string> = {
    'lhv.ee': 'lhv',
    'swedbank.ee': 'swed',
    'seb.ee': 'seb',
    'tara.ria.ee': 'tara',
  };
  const prefix = domainPrefixMap[rpDomain];
  if (!prefix) return;
  const testKeyId = `${prefix}-2026q1`;
  const sessionId = `demo-${Date.now()}`;

  const domCodePromise = details.tabId ? getDomCode(details.tabId) : Promise.resolve(null as string | null);

  withAttestationLock(async () => {
    const domCode = await domCodePromise;
    await processDemoAttestation(createHeader, testCode, rpDomain, testKeyId, sessionId, domCode);
  }).catch((err) => {
    log.warn('[Demo] Attestation processing failed:', err);
  });
}

async function processDemoAttestation(
  createHeader: (code: string, domain: string, keyId: string, sessionId?: string) => Promise<string | null>,
  code: string,
  domain: string,
  keyId: string,
  sessionId: string,
  domCode: string | null,
): Promise<void> {
  const header = await createHeader(code, domain, keyId, sessionId);
  if (!header) return;

  if (!verifier) return;
  const attestedCode = await verifier.verifyHeader(header, domain);
  if (!attestedCode) return;

  await logAuditEvent(AuditEventType.AttestationVerified, {
    rpDomain: domain,
    code: attestedCode.controlCode,
    keyId: attestedCode.keyId,
    mode: 'demo',
  });

  currentAttestationStatus = verifier.verifyControlCode(attestedCode, domCode);
  log.info(`[Demo] Attestation verified for ${domain}: code ${attestedCode.controlCode}`);
}

function setupWebRequestListener(): void {
  const filter: chrome.webRequest.RequestFilter = {
    urls: WHITELISTED_RP_DOMAINS.map((d) => `*://*.${d}/*`),
    types: ['main_frame'],
  };

  (browser.webRequest.onHeadersReceived as any).addListener(
    (details: any) => handleHeadersReceived(details),
    filter,
    ['responseHeaders', 'extraHeaders'],
  );

  log.info(`WebRequest listener registered for ${WHITELISTED_RP_DOMAINS.length} RP domains`);
}

function handleHeadersReceived(
  details: any,
): void {
  if (!details.responseHeaders || !verifier || !keyStore) return;

  const attestationHeader = details.responseHeaders.find(
    (h: { name: string; value?: string }) => h.name.toLowerCase() === 'smartid-attestation',
  );
  if (!attestationHeader?.value) return;

  const rpDomain = extractRpDomain(details.url);
  if (!rpDomain) return;

  const tabId = details.tabId;

  const domCodePromise = tabId ? getDomCode(tabId) : Promise.resolve(null as string | null);

  withAttestationLock(async () => {
    const domCode = await domCodePromise;
    await processAttestationHeader(attestationHeader!.value!, rpDomain, domCode);
  }).catch((err) => {
    log.warn('Header processing failed:', err);
  });
}

async function processAttestationHeader(
  rawValue: string,
  rpDomain: string,
  domCode: string | null,
): Promise<void> {
  if (!verifier) return;

  const attestedCode = await verifier.verifyHeader(rawValue, rpDomain);

  if (attestedCode) {
    log.info(`Attestation verified for ${rpDomain}: code ${attestedCode.controlCode}`);
    await logAuditEvent(AuditEventType.AttestationVerified, {
      rpDomain,
      code: attestedCode.controlCode,
      keyId: attestedCode.keyId,
    });
  } else {
    log.warn(`Attestation failed for ${rpDomain}`);
    await logAuditEvent(AuditEventType.AttestationFailed, { rpDomain });
  }

  currentAttestationStatus = verifier.verifyControlCode(attestedCode, domCode);

  if (attestedCode) {
    log.info('Attested control code:', attestedCode.controlCode);
  }
}

export async function getDomCode(tabId: number): Promise<string | null> {
  try {
    const response = await withTimeout(
      browser.tabs.sendMessage(tabId, { type: 'scrape-control-code', payload: {} }),
      1000,
    ) as { success: boolean; controlCode?: string | null; error?: string };

    if (response?.success && response.controlCode) {
      return response.controlCode;
    }
    return null;
  } catch {
    return null;
  }
}

function extractRpDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    for (const domain of WHITELISTED_RP_DOMAINS) {
      if (parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)) return domain;
    }
    return null;
  } catch {
    return null;
  }
}
