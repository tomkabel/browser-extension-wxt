import { browser } from 'wxt/browser';
import type { AuditEventType } from './types';
import { log } from '~/lib/errors';

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function logAuditEvent(
  eventType: AuditEventType,
  details: Record<string, unknown>,
): Promise<void> {
  const codeHash = details.code ? await sha256(String(details.code)) : undefined;
  const domCodeHash = details.domCode ? await sha256(String(details.domCode)) : undefined;

  const sanitizedDetails: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key !== 'code' && key !== 'domCode') {
      sanitizedDetails[key] = value;
    }
  }
  if (codeHash) sanitizedDetails.codeHash = codeHash;
  if (domCodeHash) sanitizedDetails.domCodeHash = domCodeHash;

  log.info(`[Audit] ${eventType}:`, sanitizedDetails);

  try {
    const stored = await browser.storage.session.get('attestation:auditLog');
    const auditLog = (stored['attestation:auditLog'] as AuditEntry[]) ?? [];
    auditLog.push({
      eventType,
      timestamp: Date.now(),
      details: sanitizedDetails,
    });
    const MAX_AUDIT_LOG = 100;
    const trimmed = auditLog.slice(-MAX_AUDIT_LOG);
    await browser.storage.session.set({ 'attestation:auditLog': trimmed });
  } catch {
    // Silently handle storage errors
  }
}

export interface AuditEntry {
  eventType: AuditEventType;
  timestamp: number;
  details: Record<string, unknown>;
}

export async function getAuditLog(): Promise<AuditEntry[]> {
  const stored = await browser.storage.session.get('attestation:auditLog');
  return (stored['attestation:auditLog'] as AuditEntry[]) ?? [];
}
