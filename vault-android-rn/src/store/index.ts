import { create } from 'zustand';
import type {
  ConnectionStatus,
  PairingStatus,
  Coordinate,
  VaultCredential,
  NoiseSession,
} from '../types';

interface PairingSlice {
  pairingStatus: PairingStatus;
  sasCode: string | null;
  emojiSas: [string, string, string] | null;
  pairingError: string | null;
  setPairingStatus: (status: PairingStatus) => void;
  setSasCode: (code: string | null) => void;
  setEmojiSas: (emoji: [string, string, string] | null) => void;
  setPairingError: (error: string | null) => void;
  resetPairing: () => void;
}

interface ConnectionSlice {
  connectionStatus: ConnectionStatus;
  deviceId: string | null;
  deviceName: string | null;
  lastHeartbeat: number | null;
  reconnectAttempt: number;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDeviceId: (id: string | null) => void;
  setDeviceName: (name: string | null) => void;
  setLastHeartbeat: (ts: number | null) => void;
  setReconnectAttempt: (attempt: number) => void;
}

interface VaultSlice {
  hasLhvCredentials: boolean;
  hasSmartIdPin: boolean;
  pendingCredentialRequest: { domain: string; sequence: number } | null;
  setHasLhvCredentials: (has: boolean) => void;
  setHasSmartIdPin: (has: boolean) => void;
  setPendingCredentialRequest: (req: { domain: string; sequence: number } | null) => void;
}

interface TransportSlice {
  noiseSession: NoiseSession | null;
  isDataChannelOpen: boolean;
  heldCoordinates: Coordinate[] | null;
  isSequenceHeld: boolean;
  setNoiseSession: (session: NoiseSession | null) => void;
  setIsDataChannelOpen: (open: boolean) => void;
  setHeldCoordinates: (coords: Coordinate[] | null) => void;
  setIsSequenceHeld: (held: boolean) => void;
}

export type AppStore = PairingSlice & ConnectionSlice & VaultSlice & TransportSlice;

export const useAppStore = create<AppStore>((set) => ({
  // Pairing slice
  pairingStatus: 'idle',
  sasCode: null,
  emojiSas: null,
  pairingError: null,
  setPairingStatus: (status) => set({ pairingStatus: status }),
  setSasCode: (code) => set({ sasCode: code }),
  setEmojiSas: (emoji) => set({ emojiSas: emoji }),
  setPairingError: (error) => set({ pairingError: error }),
  resetPairing: () =>
    set({
      pairingStatus: 'idle',
      sasCode: null,
      emojiSas: null,
      pairingError: null,
    }),

  // Connection slice
  connectionStatus: 'disconnected',
  deviceId: null,
  deviceName: null,
  lastHeartbeat: null,
  reconnectAttempt: 0,
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setDeviceId: (id) => set({ deviceId: id }),
  setDeviceName: (name) => set({ deviceName: name }),
  setLastHeartbeat: (ts) => set({ lastHeartbeat: ts }),
  setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),

  // Vault slice
  hasLhvCredentials: false,
  hasSmartIdPin: false,
  pendingCredentialRequest: null,
  setHasLhvCredentials: (has) => set({ hasLhvCredentials: has }),
  setHasSmartIdPin: (has) => set({ hasSmartIdPin: has }),
  setPendingCredentialRequest: (req) => set({ pendingCredentialRequest: req }),

  // Transport slice
  noiseSession: null,
  isDataChannelOpen: false,
  heldCoordinates: null,
  isSequenceHeld: false,
  setNoiseSession: (session) => set({ noiseSession: session }),
  setIsDataChannelOpen: (open) => set({ isDataChannelOpen: open }),
  setHeldCoordinates: (coords) => set({ heldCoordinates: coords }),
  setIsSequenceHeld: (held) => set({ isSequenceHeld: held }),
}));
