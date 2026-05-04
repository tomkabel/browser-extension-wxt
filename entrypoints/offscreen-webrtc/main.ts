/// <reference types="w3c-web-usb" />
import { io, type Socket } from 'socket.io-client';
import { BackpressureQueue } from '~/lib/channel/backpressureQueue';
import { ANDROID_VENDOR_IDS } from '~/lib/transport/vendorIds';

interface QrSdpData {
  type: RTCSdpType;
  sdp: string;
  candidates: string[];
}

export interface TurnCredentials {
  username: string;
  credential?: string;
  password?: string;
  ttl: number;
  urls: string[];
  stunUrls: string[];
}

const SIGNALING_SERVER_URL =
  import.meta.env.VITE_SIGNALING_URL ?? 'https://smartid2-signaling.fly.dev';

let pc: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let socket: Socket | null = null;
let sasCode: string | null = null;
let nonce: number[] | null = null;
let extensionStaticKey: number[] | null = null;
export const DATA_CHANNEL_CONFIG: RTCDataChannelInit = {
  ordered: true,
  maxPacketLifeTime: 3000,
  negotiated: false,
  id: 0,
};

let keepalivePort: chrome.runtime.Port | null = null;
let turnCredentials: TurnCredentials | null = null;
let usbDevice: USBDevice | null = null;
let pendingSdpOffer: RTCSessionDescriptionInit | null = null;
let backpressureQueue: BackpressureQueue | null = null;
let offerAlreadyCreated = false;

const RECONNECT_BACKOFF_INITIAL = 1000;
const RECONNECT_BACKOFF_MAX = 30_000;
const CONNECTION_TOTAL_TIMEOUT_MS = 15_000;

let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
let credsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastConnectionState = '';

function log(message: string): void {
  if (import.meta.env.DEV) {
    console.log(`[Offscreen-WebRTC] ${message}`);
  }
}

function notifyBackground(type: string, payload?: unknown): void {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

async function fetchTurnCredentials(): Promise<TurnCredentials | null> {
  try {
    const url = new URL('/turn-credentials', SIGNALING_SERVER_URL);
    const response = await fetch(url.toString(), {
      headers: { 'x-room-id': sasCode ?? '' },
    });

    if (!response.ok) {
      log(`TURN credentials fetch failed: ${response.status}`);
      return null;
    }

    const creds = (await response.json()) as TurnCredentials;
    log(`TURN credentials received (TTL: ${creds.ttl}s, servers: ${creds.urls.length})`);
    return creds;
  } catch (err) {
    log(`TURN credentials error: ${err}`);
    return null;
  }
}

function scheduleCredsRefresh(ttlSeconds: number): void {
  const refreshMs = Math.max((ttlSeconds - 30) * 1000, 5_000);
  credsRefreshTimer = setTimeout(async () => {
    const newCreds = await fetchTurnCredentials();
    if (newCreds) {
      turnCredentials = newCreds;
      scheduleCredsRefresh(newCreds.ttl);
    }
  }, refreshMs);
}

export function buildIceServers(creds: TurnCredentials | null): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (creds) {
    if (Array.isArray(creds.stunUrls)) {
      for (const stunUrl of creds.stunUrls) {
        if (typeof stunUrl === 'string' && stunUrl.length > 0) {
          servers.push({ urls: stunUrl });
        }
      }
    }

    const turnUrls = creds.urls;
    if (Array.isArray(turnUrls) && turnUrls.length > 0) {
      const validUrls = turnUrls.filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (validUrls.length > 0) {
        const turnConfig: RTCIceServer = { urls: validUrls };
        if (creds.username) turnConfig.username = creds.username;
        if (creds.credential) turnConfig.credential = creds.credential;
        else if (creds.password) turnConfig.credential = creds.password;
        servers.push(turnConfig);
      }
    }
  }

  return servers;
}

function logConnectionMetrics(): void {
  if (!import.meta.env.DEV || !pc) return;

  try {
    const stats = pc.getStats();

    stats
      .then((report) => {
        let candidateType = 'unknown';
        let transportProtocol = 'unknown';
        let rtt: number | undefined;

        for (const stat of report.values()) {
          if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
            rtt = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : undefined;

            const localCandidate = report.get(stat.localCandidateId);
            if (localCandidate) {
              const lc = localCandidate as { candidateType?: string; protocol?: string };
              candidateType = lc.candidateType ?? 'unknown';
              transportProtocol = lc.protocol ?? 'unknown';
            }
            break;
          }
        }

        log(
          `Connection metrics: type=${candidateType}, protocol=${transportProtocol}, rtt=${rtt?.toFixed(1) ?? 'N/A'}ms`,
        );

        if (candidateType === 'relay') {
          log('Using TURN relay transport');
        }

        notifyBackground('webrtc-metrics', {
          candidateType,
          rtt,
          transportProtocol,
        });
      })
      .catch(() => {});
  } catch {
    // getStats may not be available
  }
}

function setupPeerConnection(relayOnly = false): void {
  pc = new RTCPeerConnection({
    iceServers: buildIceServers(turnCredentials),
    iceTransportPolicy: relayOnly ? 'relay' : 'all',
    iceCandidatePoolSize: 0,
  });

  // SCTP ordered delivery ensures command sequencing; maxPacketLifeTime drops stale retransmissions
  dataChannel = pc.createDataChannel('smartid2', DATA_CHANNEL_CONFIG);

  backpressureQueue = new BackpressureQueue();
  dataChannel.binaryType = 'arraybuffer';

  dataChannel.onopen = () => {
    log(`Data channel opened${relayOnly ? ' (relay)' : ''}`);
    if (!relayOnly) {
      logConnectionMetrics();
    }
  };

  dataChannel.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      chrome.runtime
        .sendMessage({
          type: 'webrtc-data-received',
          payload: { data: Array.from(new Uint8Array(event.data)) },
        })
        .catch(() => {});
    }
  };

  dataChannel.onclose = () => {
    log(`Data channel closed${relayOnly ? ' (relay)' : ''}`);
  };

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate && sasCode) {
      socket?.emit('ice-candidate', sasCode, event.candidate);
    }
  };

  if (relayOnly) {
    pc.onconnectionstatechange = () => {
      log(`Connection state (relay): ${pc?.connectionState}`);
    };
    pc.oniceconnectionstatechange = () => {
      log(`ICE connection state (relay): ${pc?.iceConnectionState}`);
    };
  } else {
    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState ?? 'unknown';
      log(`Connection state: ${state}`);

      notifyBackground('webrtc-connection-state', {
        state,
        previous: lastConnectionState,
      });

      lastConnectionState = state;

      if (connectionTimeout && (state === 'connected' || state === 'failed')) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }

      if (state === 'connected') {
        reconnectAttempt = 0;
        logConnectionMetrics();
      }

      if (state === 'failed' || state === 'disconnected') {
        scheduleReconnect();
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc?.iceConnectionState ?? 'unknown';
      log(`ICE connection state: ${iceState}`);

      if (iceState === 'failed' && reconnectAttempt === 0) {
        attemptRelayFallback();
      }
    };

    connectionTimeout = setTimeout(() => {
      if (pc?.connectionState !== 'connected') {
        log('Connection timeout - total failure');
        notifyBackground('webrtc-connection-timeout', {});
      }
    }, CONNECTION_TOTAL_TIMEOUT_MS);
  }
}

function attemptRelayFallback(): void {
  if (!pc || reconnectAttempt > 0) return;

  log('ICE failed, attempting relay-only retry');

  closePeerConnection();
  setupPeerConnection(true);
  createOffer().catch((err) => log(`Relay offer error: ${err}`));
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;

  const delay = Math.min(
    RECONNECT_BACKOFF_INITIAL * Math.pow(2, reconnectAttempt),
    RECONNECT_BACKOFF_MAX,
  );
  const jitter = delay * 0.3 * Math.random();
  const actualDelay = Math.floor(delay + jitter);

  reconnectAttempt++;
  log(`Scheduling reconnect attempt ${reconnectAttempt} in ${actualDelay}ms`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    log(`Reconnect attempt ${reconnectAttempt}`);

    const newCreds = await fetchTurnCredentials();
    if (newCreds) {
      turnCredentials = newCreds;
    }

    closePeerConnection();
    setupPeerConnection();
    connectSignaling(sasCode!, nonce ?? undefined, extensionStaticKey ?? undefined);
  }, actualDelay);
}

function closePeerConnection(): void {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
}

function connectSignaling(code: string, roomNonce?: number[], extStaticKey?: number[]): void {
  sasCode = code;
  nonce = roomNonce ?? null;
  extensionStaticKey = extStaticKey ?? null;

  socket = io(SIGNALING_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    log('Signaling connected');

    if (nonce && extensionStaticKey) {
      const roomId = `smartid2::${code}`;
      socket?.emit('register-room', {
        sasCode: code,
        nonce,
        extensionStaticKey,
        roomId,
      });
    }

    socket?.emit('join-room', code);
  });

  socket.on('room-joined', ({ peerCount }: { peerCount: number }) => {
    log(`Room joined. Peers: ${peerCount}`);
    if (peerCount >= 2 && pc && pc.signalingState === 'stable' && !offerAlreadyCreated) {
      createOffer().catch((err) => log(`Offer error: ${err}`));
    }
  });

  socket.on('sdp-offer', async (offer: RTCSessionDescriptionInit) => {
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit('sdp-answer', sasCode, answer);
    } catch (err) {
      log(`Handle offer error: ${err}`);
    }
  });

  socket.on('sdp-answer', async (answer: RTCSessionDescriptionInit) => {
    if (!pc || pc.signalingState !== 'have-local-offer') return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      log(`Handle answer error: ${err}`);
    }
  });

  socket.on('ice-candidate', async (candidate: RTCIceCandidateInit) => {
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      log(`ICE candidate error: ${err}`);
    }
  });

  socket.on('disconnect', () => {
    log('Signaling disconnected');
  });
}

async function createOffer(): Promise<void> {
  if (!pc || !sasCode) return;
  try {
    offerAlreadyCreated = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    pendingSdpOffer = offer;
    socket?.emit('sdp-offer', sasCode, offer);
  } catch (err) {
    log(`createOffer error: ${err}`);
  }
}

async function generateQrSdp(): Promise<QrSdpData | null> {
  if (!pc) return null;
  try {
    const offer = await pc.createOffer({ iceRestart: false });
    await pc.setLocalDescription(offer);
    pendingSdpOffer = offer;
    offerAlreadyCreated = true;
    const iceCandidates: string[] = [];
    const originalHandler = pc.onicecandidate;
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates.push(event.candidate.candidate);
      }
    };
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    pc.onicecandidate = originalHandler;
    return {
      type: offer.type,
      sdp: compressSdp(offer.sdp ?? ''),
      candidates: iceCandidates,
    };
  } catch (err) {
    log(`generateQrSdp error: ${err}`);
    return null;
  }
}

function compressSdp(sdp: string): string {
  return btoa(new TextEncoder().encode(sdp).reduce((acc, b) => acc + String.fromCharCode(b), ''));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sendData(data: Uint8Array): boolean {
  if (dataChannel?.readyState === 'open') {
    dataChannel.send(data as Uint8Array<ArrayBuffer>);
    return true;
  }
  return false;
}

async function connectWebUsb(): Promise<boolean> {
  try {
    if (!navigator.usb) {
      log('WebUSB not available in this browser');
      return false;
    }

    const filters = Array.from(ANDROID_VENDOR_IDS).map((vendorId) => ({ vendorId }));
    const device = await navigator.usb.requestDevice({ filters });

    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);

    usbDevice = device;
    log(`WebUSB device connected: ${device.productName}`);

    notifyBackground('transport-changed', {
      previous: null,
      current: 'usb',
      reason: 'WebUSB device connected',
    });

    startUsbReadLoop(device);
    return true;
  } catch (err) {
    log(`WebUSB connection failed: ${err}`);
    return false;
  }
}

function findUsbInputEndpoint(device: USBDevice): USBEndpoint | undefined {
  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      for (const ep of alt.endpoints) {
        if (ep.direction === 'in') return ep;
      }
    }
  }
  return undefined;
}

async function startUsbReadLoop(device: USBDevice): Promise<void> {
  const endpoint = findUsbInputEndpoint(device);
  if (!endpoint) {
    log('No USB input endpoint found');
    return;
  }
  while (device.opened) {
    try {
      const result = await device.transferIn(endpoint.endpointNumber, endpoint.packetSize);
      if (result.data && result.data.byteLength > 0) {
        const data = new Uint8Array(result.data.buffer);
        chrome.runtime
          .sendMessage({
            type: 'webrtc-data-received',
            payload: { data: Array.from(data) },
          })
          .catch(() => {});
      }
    } catch (err) {
      log(`USB read error: ${err}`);
      notifyBackground('transport-changed', {
        previous: 'usb',
        current: null,
        reason: 'USB read failed',
      });
      break;
    }
  }
}

async function sendViaUsb(data: Uint8Array): Promise<boolean> {
  if (!usbDevice?.opened) return false;
  try {
    const buf = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    await usbDevice.transferOut(0x01, buf);
    return true;
  } catch (err) {
    log(`USB send error: ${err}`);
    return false;
  }
}

function setupKeepalive(): void {
  keepalivePort = chrome.runtime.connect({ name: 'offscreen-webrtc-keepalive' });

  keepalivePort.onDisconnect.addListener(() => {
    log('Keepalive port disconnected, recreating...');
    setTimeout(setupKeepalive, 500);
  });
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  }
  if (credsRefreshTimer) {
    clearTimeout(credsRefreshTimer);
    credsRefreshTimer = null;
  }
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (backpressureQueue) {
    backpressureQueue.clear();
    backpressureQueue = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (usbDevice?.opened) {
    usbDevice.close().catch(() => {});
    usbDevice = null;
  }
  if (keepalivePort) {
    keepalivePort.disconnect();
    keepalivePort = null;
  }
  sasCode = null;
  nonce = null;
  extensionStaticKey = null;
  turnCredentials = null;
  pendingSdpOffer = null;
  offerAlreadyCreated = false;
  reconnectAttempt = 0;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'webrtc-start-pairing':
      (async () => {
        const payload = message.payload as {
          sasCode: string;
          nonce?: number[];
          extensionStaticKey?: number[];
        };
        sasCode = payload.sasCode;
        nonce = payload.nonce ?? null;
        extensionStaticKey = payload.extensionStaticKey ?? null;
        turnCredentials = await fetchTurnCredentials();
        if (turnCredentials) {
          scheduleCredsRefresh(turnCredentials.ttl);
        }
        setupPeerConnection();
        connectSignaling(sasCode, nonce ?? undefined, extensionStaticKey ?? undefined);
      })().catch((err) => log(`Start pairing error: ${err}`));
      sendResponse({ success: true });
      break;

    case 'webrtc-start-pairing-offerless':
      (async () => {
        const payload = message.payload as {
          sasCode: string;
          nonce?: number[];
          extensionStaticKey?: number[];
        };
        sasCode = payload.sasCode;
        nonce = payload.nonce ?? null;
        extensionStaticKey = payload.extensionStaticKey ?? null;
        turnCredentials = await fetchTurnCredentials();
        if (turnCredentials) {
          scheduleCredsRefresh(turnCredentials.ttl);
        }
        setupPeerConnection();
        const sdp = await generateQrSdp();
        chrome.runtime
          .sendMessage({
            type: 'webrtc-sdp-for-qr',
            payload: { sasCode, sdp },
          })
          .catch(() => {});
        connectSignaling(sasCode, nonce ?? undefined, extensionStaticKey ?? undefined);
      })().catch((err) => log(`Start pairing error: ${err}`));
      sendResponse({ success: true });
      break;

    case 'webrtc-connect-usb':
      connectWebUsb()
        .then((ok) => sendResponse({ success: ok }))
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;

    case 'webrtc-send':
      if (message.payload?.data) {
        const raw = message.payload.data;
        let data: Uint8Array;
        if (typeof raw === 'string') {
          data = base64ToUint8Array(raw);
        } else if (Array.isArray(raw)) {
          data = new Uint8Array(raw);
        } else {
          break;
        }
        if (usbDevice?.opened) {
          sendViaUsb(data);
        } else if (dataChannel && backpressureQueue) {
          backpressureQueue.send(data, dataChannel).catch((err) => log(`Backpressure send error: ${err}`));
        } else {
          sendData(data);
        }
      }
      break;

    case 'webrtc-disconnect':
      disconnect();
      break;

    case 'webrtc-get-sdp':
      sendResponse({ sdp: pendingSdpOffer });
      break;
  }
  return false;
});

setupKeepalive();

log('Offscreen WebRTC + WebUSB initialized');
