import { io, Socket } from 'socket.io-client';
import type { TurnCredentials } from '../types';
import { useAppStore } from '../store';

export interface SignalingEvents {
  onSdpOffer: (offer: RTCSessionDescriptionInit) => void;
  onSdpAnswer: (answer: RTCSessionDescriptionInit) => void;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRoomJoined: (data: { peerCount: number; turnCredentials?: TurnCredentials }) => void;
  onError: (error: { message?: string; error?: string }) => void;
  onDisconnect: () => void;
}

const ROOM_PREFIX = 'smartid2::';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export class SignalingClient {
  private socket: Socket | null = null;
  private sasCode: string | null = null;
  private events: SignalingEvents;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;

  constructor(events: SignalingEvents) {
    this.events = events;
  }

  connect(serverUrl: string, sasCode: string, commitment?: string): void {
    this.sasCode = sasCode;
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;

    const query: Record<string, string> = {};
    if (commitment) {
      query.commitment = commitment;
    }

    this.socket = io(serverUrl, {
      transports: ['websocket'],
      query,
      reconnection: false,
      timeout: 10_000,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempt = 0;
      useAppStore.getState().setReconnectAttempt(0);
      this.socket?.emit('join-room', sasCode);
    });

    this.socket.on('room-joined', (data: { peerCount: number; turnCredentials?: TurnCredentials }) => {
      this.events.onRoomJoined(data);
    });

    this.socket.on('sdp-offer', (offer: RTCSessionDescriptionInit) => {
      this.events.onSdpOffer(offer);
    });

    this.socket.on('sdp-answer', (answer: RTCSessionDescriptionInit) => {
      this.events.onSdpAnswer(answer);
    });

    this.socket.on('ice-candidate', (candidate: RTCIceCandidateInit) => {
      this.events.onIceCandidate(candidate);
    });

    this.socket.on('error', (error: { message?: string; error?: string }) => {
      this.events.onError(error);
    });

    this.socket.on('disconnect', () => {
      if (!this.intentionalDisconnect) {
        this.events.onDisconnect();
        this.scheduleReconnect(serverUrl);
      }
    });

    this.socket.on('connect_error', () => {
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect(serverUrl);
      }
    });
  }

  private scheduleReconnect(serverUrl: string): void {
    if (this.intentionalDisconnect) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    useAppStore.getState().setReconnectAttempt(this.reconnectAttempt);

    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalDisconnect && this.sasCode) {
        this.connect(serverUrl, this.sasCode);
      }
    }, delay);
  }

  sendSdpOffer(offer: RTCSessionDescriptionInit): void {
    if (this.socket?.connected && this.sasCode) {
      this.socket.emit('sdp-offer', this.sasCode, offer);
    }
  }

  sendSdpAnswer(answer: RTCSessionDescriptionInit): void {
    if (this.socket?.connected && this.sasCode) {
      this.socket.emit('sdp-answer', this.sasCode, answer);
    }
  }

  sendIceCandidate(candidate: RTCIceCandidateInit): void {
    if (this.socket?.connected && this.sasCode) {
      this.socket.emit('ice-candidate', this.sasCode, candidate);
    }
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sasCode = null;
    this.reconnectAttempt = 0;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
