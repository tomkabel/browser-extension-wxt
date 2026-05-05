import { create } from 'zustand';
import type {
  CredentialState,
  PairingState,
  SessionState,
  TransactionData,
  TransactionState,
  ApprovedDomain,
} from '~/types';
import type { TransportType } from '~/lib/transport/types';
import type { AttestationStatus } from '~/lib/attestation';

export type TransportStatusType = TransportType | null;

export interface TabState {
  domain: string;
  registrableDomain: string;
  url: string;
  isPublic: boolean;
}

export type AssertionStatus = 'idle' | 'pending' | 'verified' | 'error' | 'timeout';

export interface AppStore {
  currentTab: TabState | null;
  apiHealthy: boolean | null;
  apiStatus: 'idle' | 'sending' | 'success' | 'error';
  apiError: string | null;
  lastSent: Date | null;

  setCurrentTab: (tab: TabState | null) => void;
  setApiHealthy: (healthy: boolean | null) => void;
  setApiStatus: (status: AppStore['apiStatus']) => void;
  setApiError: (error: string | null) => void;
  setLastSent: (date: Date | null) => void;

  pairingState: PairingState;
  pairingError: string | null;
  sasCode: string | null;
  deviceName: string | null;
  sasMode: 'emoji' | 'numeric';
  emojiSas: [string, string, string] | null;

  setPairingState: (state: PairingState) => void;
  setPairingError: (error: string | null) => void;
  setSasCode: (code: string | null) => void;
  setDeviceName: (name: string | null) => void;
  setSasMode: (mode: 'emoji' | 'numeric') => void;
  setEmojiSas: (sas: [string, string, string] | null) => void;

  sessionState: SessionState;
  sessionExpiry: number | null;
  sessionRemaining: number | null;

  setSessionState: (state: SessionState) => void;
  setSessionExpiry: (expiry: number | null) => void;
  setSessionRemaining: (remaining: number | null) => void;

  transactionState: TransactionState;
  transactionData: TransactionData;

  setTransactionState: (state: TransactionState) => void;
  setTransactionData: (data: TransactionData) => void;

  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  setConnectionState: (state: AppStore['connectionState']) => void;

  credentialState: CredentialState;
  credentialDomain: string | null;
  credentialStatus: string | null;

  setCredentialState: (state: CredentialState) => void;
  setCredentialDomain: (domain: string | null) => void;
  setCredentialStatus: (status: string | null) => void;

  activeTransport: TransportStatusType;
  usbAvailable: boolean;
  transportChangeMessage: string | null;

  setActiveTransport: (transport: TransportStatusType) => void;
  setUsbAvailable: (available: boolean) => void;
  setTransportChangeMessage: (message: string | null) => void;

  attestation: AttestationStatus;
  setAttestation: (status: AttestationStatus) => void;

  assertionStatus: AssertionStatus;
  assertionError: string | null;
  setAssertionStatus: (status: AssertionStatus) => void;
  setAssertionError: (error: string | null) => void;

  pendingDomains: Array<{ domain: string; url: string }>;
  approvedDomains: ApprovedDomain[];
  showSettings: boolean;
  showDevices: boolean;

  setPendingDomains: (domains: Array<{ domain: string; url: string }>) => void;
  setApprovedDomains: (domains: ApprovedDomain[]) => void;
  setShowSettings: (show: boolean) => void;
  setShowDevices: (show: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  currentTab: null,
  apiHealthy: null,
  apiStatus: 'idle',
  apiError: null,
  lastSent: null,

  setCurrentTab: (tab) => set({ currentTab: tab }),
  setApiHealthy: (healthy) => set({ apiHealthy: healthy }),
  setApiStatus: (status) => set({ apiStatus: status }),
  setApiError: (error) => set({ apiError: error }),
  setLastSent: (date) => set({ lastSent: date }),

  pairingState: 'unpaired',
  pairingError: null,
  sasCode: null,
  deviceName: null,
  sasMode: 'emoji',
  emojiSas: null,

  setPairingState: (state) => set({ pairingState: state }),
  setPairingError: (error) => set({ pairingError: error }),
  setSasCode: (code) => set({ sasCode: code }),
  setDeviceName: (name) => set({ deviceName: name }),
  setSasMode: (mode) => set({ sasMode: mode }),
  setEmojiSas: (sas) => set({ emojiSas: sas }),

  sessionState: 'none',
  sessionExpiry: null,
  sessionRemaining: null,

  setSessionState: (state) => set({ sessionState: state }),
  setSessionExpiry: (expiry) => set({ sessionExpiry: expiry }),
  setSessionRemaining: (remaining) => set({ sessionRemaining: remaining }),

  transactionState: 'idle',
  transactionData: { amount: null, recipient: null, origin: null, controlCode: null },

  setTransactionState: (state) => set({ transactionState: state }),
  setTransactionData: (data) => set({ transactionData: data }),

  connectionState: 'disconnected',
  setConnectionState: (state) => set({ connectionState: state }),

  credentialState: 'idle',
  credentialDomain: null,
  credentialStatus: null,

  setCredentialState: (state) => set({ credentialState: state }),
  setCredentialDomain: (domain) => set({ credentialDomain: domain }),
  setCredentialStatus: (status) => set({ credentialStatus: status }),

  activeTransport: null,
  usbAvailable: false,
  transportChangeMessage: null,

  setActiveTransport: (transport) => set({ activeTransport: transport }),
  setUsbAvailable: (available) => set({ usbAvailable: available }),
  setTransportChangeMessage: (message) => set({ transportChangeMessage: message }),

  attestation: { type: 'not_applicable' },
  setAttestation: (status) => set({ attestation: status }),

  assertionStatus: 'idle',
  assertionError: null,
  setAssertionStatus: (status) => set({ assertionStatus: status }),
  setAssertionError: (error) => set({ assertionError: error }),

  pendingDomains: [],
  approvedDomains: [],
  showSettings: false,
  showDevices: false,

  setPendingDomains: (domains) => set({ pendingDomains: domains }),
  setApprovedDomains: (domains) => set({ approvedDomains: domains }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowDevices: (show) => set({ showDevices: show }),
}));
