import { browser } from 'wxt/browser';
import { KeyStore, WHITELISTED_RP_DOMAINS, createVerifier, refreshKeyManifest, logAuditEvent, AuditEventType, createDemoAttestationHeader, isDemoMode } from '~/lib/attestation';
import type { AttestationStatus } from '~/lib/attestation';
import { log } from '~/lib/errors';
import bundledManifest from '~/lib/attestation/trusted-rp-keys.json';

let keyStore: KeyStore | null = null;
let verifier: ReturnType<typeof createVerifier> | null = null;
let currentAttestationStatus: AttestationStatus = { type: 'not_applicable' };

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
    setupDemoAttestationInjector();
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

async function setupDemoAttestationInjector(): Promise<void> {
  (browser.webRequest.onBeforeRequest as unknown as (
    callback: (details: chrome.webRequest.WebRequestBodyDetails) => void,
    filter: chrome.webRequest.RequestFilter,
    extraInfoSpec: string[],
  ) => void)(
    injectDemoAttestation,
    { urls: ['<all_urls>'], types: ['main_frame'] },
    [],
  );
  log.info('Demo attestation injector active');
}

function injectDemoAttestation(
  details: chrome.webRequest.WebRequestBodyDetails,
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

  processDemoAttestation(testCode, rpDomain, testKeyId, sessionId).catch((err) => {
    log.warn('[Demo] Attestation processing failed:', err);
  });
}

async function processDemoAttestation(
  code: string,
  domain: string,
  keyId: string,
  sessionId: string,
): Promise<void> {
  const header = await createDemoAttestationHeader(code, domain, keyId, sessionId);
  if (!header) return;

  if (!verifier) return;
  const attestedCode = await verifier.verifyHeader(header, domain);
  if (attestedCode) {
    await logAuditEvent(AuditEventType.AttestationVerified, {
      rpDomain: domain,
      code: attestedCode.controlCode,
      keyId: attestedCode.keyId,
      mode: 'demo',
    });
    currentAttestationStatus = verifier.verifyControlCode(attestedCode, null);
    log.info(`[Demo] Attestation verified for ${domain}: code ${attestedCode.controlCode}`);
  }
}

function setupWebRequestListener(): void {
  const filter: chrome.webRequest.RequestFilter = {
    urls: WHITELISTED_RP_DOMAINS.map((d) => `*://*.${d}/*`),
    types: ['main_frame'],
  };

  (browser.webRequest.onHeadersReceived as unknown as (
    callback: (details: chrome.webRequest.WebResponseHeadersDetails) => void,
    filter: chrome.webRequest.RequestFilter,
    extraInfoSpec: string[],
  ) => void)(
    handleHeadersReceived,
    filter,
    ['responseHeaders', 'extraHeaders'],
  );

  log.info(`WebRequest listener registered for ${WHITELISTED_RP_DOMAINS.length} RP domains`);
}

function handleHeadersReceived(
  details: chrome.webRequest.WebResponseHeadersDetails,
): void {
  if (!details.responseHeaders || !verifier || !keyStore) return;

  const attestationHeader = details.responseHeaders.find(
    (h) => h.name.toLowerCase() === 'smartid-attestation',
  );
  if (!attestationHeader?.value) return;

  const rpDomain = extractRpDomain(details.url);
  if (!rpDomain) return;

  processAttestationHeader(attestationHeader.value, rpDomain).catch((err) => {
    log.warn('Header processing failed:', err);
  });
}

async function processAttestationHeader(
  rawValue: string,
  rpDomain: string,
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

  currentAttestationStatus = verifier.verifyControlCode(attestedCode, null);

  if (attestedCode) {
    log.info('Attested control code:', attestedCode.controlCode);
  }
}

function extractRpDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    for (const domain of WHITELISTED_RP_DOMAINS) {
      if (parsed.hostname.endsWith(domain)) return domain;
    }
    return null;
  } catch {
    return null;
  }
}
