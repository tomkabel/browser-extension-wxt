/**
 * All TypeScript interfaces for the extension.
 */

export interface TabDomainState {
  tabId: number;
  domain: string;
  registrableDomain: string;
  url: string;
  timestamp: number;
  isPublic: boolean;
}

export interface ScrapeResult {
  success: boolean;
  text?: string;
  headings?: string[];
  linkCount?: number;
  imageCount?: number;
  filtered?: boolean;
  error?: string;
  retryAfterMs?: number;
}

export interface StructuredContent {
  headings: string[];
  links: { text: string; href: string }[];
  formCount: number;
  imageCount: number;
  textContent: string;
}

export interface SendPayload {
  content: unknown;
  metadata: {
    domain: string;
    url: string;
    timestamp: number;
  };
}

export interface ApiResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

export interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type MessageType =
  | 'tab-domain-changed'
  | 'get-current-domain'
  | 'send-to-api'
  | 'check-api-health'
  | 'read-dom'
  | 'start-pairing'
  | 'check-session'
  | 'verify-transaction'
  | 'detect-transaction'
  | 'detect-login-form'
  | 'credential-request'
  | 'credential-response'
  | 'mfa-assertion'
  | 'pairing-confirmed'
  | 'pairing-rejected'
  | 'prf-credential-created'
  | 'webrtc-connection-state'
  | 'webrtc-connection-timeout'
  | 'get-connection-state'
  | 'webrtc-metrics'
  | 'webrtc-create-offscreen'
  | 'webrtc-close-offscreen'
  | 'webrtc-keepalive-status'
  | 'webrtc-send'
  | 'webrtc-data-received'
  | 'webrtc-start-pairing'
  | 'webrtc-disconnect'
  | 'usb-connected'
  | 'usb-disconnected'
  | 'transport-changed'
  | 'get-attestation-status'
  | 'refresh-rp-keys'
  | 'deliver-attested-code'
  | 'scrape-control-code'
  | 'passkey-credential-created'
  | 'passkey-credential-error'
  | 'begin-challenge-assertion'
  | 'assertion-complete'
  | 'get-cached-credential-id'
  | 'login-form-detected-unapproved'
  | 'domain-approved'
  | 'domain-denied'
  | 'get-approved-domains'
  | 'get-pending-domains'
  | 'check-domain-approved'
  | 'webrtc-sdp-for-qr'
  | 'webrtc-connect-usb'
  | 'webrtc-start-pairing-offerless'
  | 'webrtc-ping';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload: T;
}

export type PairingState =
  | 'unpaired'
  | 'displaying_qr'
  | 'waiting_for_handshake'
  | 'awaiting_sas_confirmation'
  | 'paired'
  | 'error';

export type SessionState = 'none' | 'active' | 'expiring' | 'expired';

export interface MfaSession {
  sessionToken: string;
  mfaVerifiedAt: number;
  expiry: number;
  deviceName?: string;
}

export type TransactionState = 'idle' | 'verifying' | 'confirmed' | 'rejected';

export interface TransactionData {
  amount: string | null;
  recipient: string | null;
  origin?: string | null;
  controlCode?: string | null;
}

export interface PairingPayload {
  ssid: string;
  host: string;
  port: number;
  sasCode: string;
}

export interface LoginFormDetection {
  domain: string;
  url: string;
  usernameSelector: string;
  passwordSelector: string;
}

export interface CredentialRequestPayload {
  domain: string;
  url: string;
  usernameFieldId: string;
  passwordFieldId: string;
}

export interface CredentialResponse {
  status: 'found' | 'not_found' | 'error';
  username?: string;
  password?: string;
  approval_mode?: 'auto' | 'biometric';
}

export type CredentialState =
  | 'idle'
  | 'detecting'
  | 'requesting'
  | 'waiting_phone'
  | 'filling'
  | 'filled'
  | 'not_found'
  | 'error';

export interface ApprovedDomain {
  domain: string;
  registeredAt: number;
  scriptId: string;
}

export interface UnapprovedLoginForm {
  domain: string;
  url: string;
  usernameSelector: string;
  passwordSelector: string;
}

export interface AttestedCodePayload {
  controlCode: string;
  rpDomain: string;
  keyId: string;
  signature: string;
  sessionId?: string;
  timestamp?: number;
}
