export type {
  AttestedCode,
  AttestationHeaderPayload,
  TrustedRpSigningKey,
  SignedKeyManifest,
  RpKeyStore,
  AttestationStatus,
} from './types';
export { AuditEventType } from './types';

export { base64urlDecode, base64urlEncode, sortedJsonStringify } from './base64url';
export { parseAttestationHeader } from './headerParser';
export type { ParsedAttestationHeader } from './headerParser';

export { KeyStore, WHITELISTED_RP_DOMAINS } from './keyStore';
export { createVerifier } from './verifier';
export type { AttestationVerifier } from './verifier';
export { refreshKeyManifest } from './manifest';
export { logAuditEvent, getAuditLog } from './audit';
export type { AuditEntry } from './audit';
export { isDemoMode } from './env';
