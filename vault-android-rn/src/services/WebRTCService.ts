import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';
import { SignalingClient, type SignalingEvents } from './SignalingClient';
import type { TurnCredentials } from '../types';
import { useAppStore } from '../store';

const CHUNK_SIZE = 16_384; // 16KB
const HEADER_SIZE = 4; // 2 bytes sequence + 2 bytes chunk index

export interface WebRTCEvents {
  onDataChannelMessage: (data: string | ArrayBuffer) => void;
  onDataChannelOpen: () => void;
  onDataChannelClose: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: any | null = null; // RTCDataChannel type from react-native-webrtc
  private signalingClient: SignalingClient | null = null;
  private events: WebRTCEvents;
  private turnCredentials: TurnCredentials | null = null;
  private sasCode: string | null = null;
  private serverUrl: string | null = null;

  // Chunked message reassembly
  private pendingChunks: Map<number, Map<number, ArrayBuffer>> = new Map();
  private expectedChunkCounts: Map<number, number> = new Map();
  private chunkCleanupTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private static readonly CHUNK_TIMEOUT_MS = 30_000;

  constructor(events: WebRTCEvents) {
    this.events = events;
  }

  async connect(serverUrl: string, sasCode: string, commitment?: string): Promise<void> {
    this.serverUrl = serverUrl;
    this.sasCode = sasCode;

    const signalingEvents: SignalingEvents = {
      onSdpOffer: (offer) => this.handleSdpOffer(offer),
      onSdpAnswer: (answer) => this.handleSdpAnswer(answer),
      onIceCandidate: (candidate) => this.handleRemoteIceCandidate(candidate),
      onRoomJoined: (data) => this.handleRoomJoined(data),
      onError: (error) => this.handleSignalingError(error),
      onDisconnect: () => this.handleSignalingDisconnect(),
    };

    this.signalingClient = new SignalingClient(signalingEvents);
    this.signalingClient.connect(serverUrl, sasCode, commitment);
    useAppStore.getState().setConnectionStatus('connecting');
  }

  private handleRoomJoined(data: { peerCount: number; turnCredentials?: TurnCredentials }): void {
    if (data.turnCredentials) {
      this.turnCredentials = data.turnCredentials;
    }
    this.createPeerConnection();
  }

  private createPeerConnection(): void {
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (this.turnCredentials) {
      iceServers.push({
        urls: this.turnCredentials.urls,
        username: this.turnCredentials.username,
        credential: this.turnCredentials.credential,
      });
    }

    this.peerConnection = new RTCPeerConnection({ iceServers });

    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.signalingClient?.sendIceCandidate(event.candidate.toJSON());
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      if (state === 'connected') {
        useAppStore.getState().setConnectionStatus('connected');
        this.events.onConnected();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        useAppStore.getState().setConnectionStatus('disconnected');
        this.events.onDisconnected();
      }
    };

    this.peerConnection.ondatachannel = (event: any) => {
      this.setupDataChannel(event.channel);
    };

    // As responder, we wait for the offer from the extension
  }

  private setupDataChannel(channel: any): void {
    this.dataChannel = channel;
    useAppStore.getState().setIsDataChannelOpen(true);

    channel.onmessage = (event: any) => {
      this.handleIncomingMessage(event.data);
    };

    channel.onopen = () => {
      this.events.onDataChannelOpen();
    };

    channel.onclose = () => {
      useAppStore.getState().setIsDataChannelOpen(false);
      this.events.onDataChannelClose();
    };
  }

  private async handleSdpOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.signalingClient?.sendSdpAnswer(answer);
  }

  private handleSdpAnswer(answer: RTCSessionDescriptionInit): void {
    if (!this.peerConnection) return;
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private handleRemoteIceCandidate(candidate: RTCIceCandidateInit): void {
    if (!this.peerConnection) return;
    this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private handleSignalingError(error: { message?: string; error?: string }): void {
    useAppStore.getState().setPairingError(error.message ?? error.error ?? 'Unknown signaling error');
    useAppStore.getState().setPairingStatus('error');
  }

  private handleSignalingDisconnect(): void {
    useAppStore.getState().setConnectionStatus('disconnected');
    this.events.onDisconnected();
  }

  send(data: string | ArrayBuffer): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }

    if (typeof data === 'string') {
      this.dataChannel.send(data);
    } else if (data.byteLength > 65535) {
      this.sendChunked(data);
    } else {
      this.dataChannel.send(data);
    }
    return true;
  }

  private sendChunked(data: ArrayBuffer): void {
    const totalChunks = Math.ceil(data.byteLength / CHUNK_SIZE);
    const sequence = Math.floor(Math.random() * 65536);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, data.byteLength);
      const chunk = data.slice(start, end);

      const header = new ArrayBuffer(HEADER_SIZE);
      const view = new DataView(header);
      view.setUint16(0, sequence);
      view.setUint16(2, i);

      const combined = new Uint8Array(HEADER_SIZE + chunk.byteLength);
      combined.set(new Uint8Array(header), 0);
      combined.set(new Uint8Array(chunk), HEADER_SIZE);

      this.dataChannel.send(combined.buffer);
    }

    // Send end marker
    const endMarker = new ArrayBuffer(HEADER_SIZE);
    const view = new DataView(endMarker);
    view.setUint16(0, sequence);
    view.setUint16(2, 0xFFFF); // End marker
    this.dataChannel.send(endMarker);
  }

  private handleIncomingMessage(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      this.events.onDataChannelMessage(data);
      return;
    }

    // Check if this is a chunked message
    if (data.byteLength >= HEADER_SIZE) {
      const view = new DataView(data);
      const sequence = view.getUint16(0);
      const chunkIndex = view.getUint16(2);

      if (chunkIndex === 0xFFFF) {
        // End marker — assemble chunks
        const cleanupTimer = this.chunkCleanupTimers.get(sequence);
        if (cleanupTimer) {
          clearTimeout(cleanupTimer);
          this.chunkCleanupTimers.delete(sequence);
        }
        const chunks = this.pendingChunks.get(sequence);
        if (chunks) {
          const totalSize = Array.from(chunks.values()).reduce((sum, c) => sum + c.byteLength, 0);
          const assembled = new Uint8Array(totalSize);
          let offset = 0;
          const sortedKeys = Array.from(chunks.keys()).sort((a, b) => a - b);
          for (const key of sortedKeys) {
            const chunk = chunks.get(key)!;
            assembled.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
          this.pendingChunks.delete(sequence);
          this.expectedChunkCounts.delete(sequence);
          this.events.onDataChannelMessage(assembled.buffer);
        }
        return;
      }

      // Regular chunk
      if (!this.pendingChunks.has(sequence)) {
        this.pendingChunks.set(sequence, new Map());
        // Set a timeout to clean up orphaned chunk sequences (missing end marker)
        const timer = setTimeout(() => {
          this.pendingChunks.delete(sequence);
          this.expectedChunkCounts.delete(sequence);
          this.chunkCleanupTimers.delete(sequence);
        }, WebRTCService.CHUNK_TIMEOUT_MS);
        this.chunkCleanupTimers.set(sequence, timer);
      }
      const chunkData = data.slice(HEADER_SIZE);
      this.pendingChunks.get(sequence)!.set(chunkIndex, chunkData);
      return;
    }

    // Not chunked, pass through
    this.events.onDataChannelMessage(data);
  }

  disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.signalingClient) {
      this.signalingClient.disconnect();
      this.signalingClient = null;
    }
    this.turnCredentials = null;
    for (const timer of this.chunkCleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.chunkCleanupTimers.clear();
    this.pendingChunks.clear();
    this.expectedChunkCounts.clear();
    useAppStore.getState().setConnectionStatus('disconnected');
    useAppStore.getState().setIsDataChannelOpen(false);
  }

  getDataChannel(): any {
    return this.dataChannel;
  }

  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open';
  }
}
