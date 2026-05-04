export interface AttestedCode {
  controlCode: string;
  rpDomain: string;
  keyId: string;
  signature: string;
  sessionId?: string;
  timestamp?: number;
}

export interface AttestationHeaderPayload {
  code: string;
  session?: string;
  ts: number;
}

export interface TrustedRpSigningKey {
  domain: string;
  keyId: string;
  publicKeyHex: string;
  notBefore: string;
  notAfter: string;
}

export interface SignedKeyManifest {
  version: number;
  keys: TrustedRpSigningKey[];
  manifestSignature?: string;
}

export interface RpKeyStore {
  getKey(domain: string, keyId: string): TrustedRpSigningKey | undefined;
  getAllKeysForDomain(domain: string): TrustedRpSigningKey[];
  getManifestVersion(): number;
  updateManifest(manifest: SignedKeyManifest): boolean;
  getLastSeenVersion(keyId: string): Promise<number>;
}

export type AttestationStatus =
  | { type: 'verified'; attestedCode: AttestedCode }
  | { type: 'dom_only' }
  | { type: 'rat_detected'; attestedCode: AttestedCode; domCode: string }
  | { type: 'not_applicable' };

export const AuditEventType = {
  AttestationVerified: 'attestation_verified',
  AttestationFailed: 'attestation_failed',
  ControlCodeMatch: 'control_code_match',
  ControlCodeMismatch: 'control_code_mismatch',
  DomOnlyFallback: 'dom_only_fallback',
  ManifestRefreshed: 'manifest_refreshed',
  ManifestRejected: 'manifest_rejected',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];
