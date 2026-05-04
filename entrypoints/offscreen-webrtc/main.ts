import { io, type Socket } from 'socket.io-client';

export interface TurnCredentials {
  username: string;
  password: string;
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
let keepalivePort: chrome.runtime.Port | null = null;
let turnCredentials: TurnCredentials | null = null;

const RECONNECT_BACKOFF_INITIAL = 1000;
const RECONNECT_BACKOFF_MAX = 30_000;
const CONNECTION_TOTAL_TIMEOUT_MS = 15_000;

let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
let lastConnectionState = '';

function log(message: string): void {
  if (import.meta.env.DEV) {
    console.log(`[Offscreen-WebRTC] ${message}`);
  }
}

function notifyBackground(type: string, payload?: unknown): void {
  chrome.runtime
    .sendMessage({ type, payload })
    .catch(() => {});
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

export function buildIceServers(creds: TurnCredentials | null): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];

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
        if (creds.password) turnConfig.credential = creds.password;
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

    stats.then((report) => {
      let candidateType = 'unknown';
      let transportProtocol = 'unknown';
      let rtt: number | undefined;

      for (const stat of report.values()) {
        if (
          stat.type === 'candidate-pair' &&
          stat.state === 'succeeded' &&
          stat.nominated
        ) {
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
    }).catch(() => {});
  } catch {
    // getStats may not be available
  }
}

function setupPeerConnection(): void {
  pc = new RTCPeerConnection({
    iceServers: buildIceServers(turnCredentials),
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 0,
  });

  dataChannel = pc.createDataChannel('smartid2', {
    ordered: true,
    negotiated: false,
    id: 0,
  });

  dataChannel.binaryType = 'arraybuffer';

  dataChannel.onopen = () => {
    log('Data channel opened');
    logConnectionMetrics();
  };

  dataChannel.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      chrome.runtime.sendMessage({
        type: 'webrtc-data-received',
        payload: { data: Array.from(new Uint8Array(event.data)) },
      }).catch(() => {});
    }
  };

  dataChannel.onclose = () => {
    log('Data channel closed');
  };

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate && sasCode) {
      socket?.emit('ice-candidate', sasCode, event.candidate);
    }
  };

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

function attemptRelayFallback(): void {
  if (!pc || reconnectAttempt > 0) return;

  log('ICE failed, attempting relay-only retry');

  closePeerConnection();

  pc = new RTCPeerConnection({
    iceServers: buildIceServers(turnCredentials),
    iceTransportPolicy: 'relay',
    iceCandidatePoolSize: 0,
  });

  dataChannel = pc.createDataChannel('smartid2', {
    ordered: true,
    negotiated: false,
    id: 0,
  });

  dataChannel.binaryType = 'arraybuffer';
  dataChannel.onopen = () => {
    log('Data channel opened (relay)');
  };
  dataChannel.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      chrome.runtime.sendMessage({
        type: 'webrtc-data-received',
        payload: { data: Array.from(new Uint8Array(event.data)) },
      }).catch(() => {});
    }
  };
  dataChannel.onclose = () => {
    log('Data channel closed (relay)');
  };

  pc.onconnectionstatechange = () => {
    log(`Connection state (relay): ${pc?.connectionState}`);
  };

  pc.oniceconnectionstatechange = () => {
    log(`ICE connection state (relay): ${pc?.iceConnectionState}`);
  };

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate && sasCode) {
      socket?.emit('ice-candidate', sasCode, event.candidate);
    }
  };

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
    connectSignaling(sasCode!);
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

function connectSignaling(code: string): void {
  sasCode = code;

  socket = io(SIGNALING_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    log('Signaling connected');
    socket?.emit('join-room', code);
  });

  socket.on('room-joined', ({ peerCount }: { peerCount: number }) => {
    log(`Room joined. Peers: ${peerCount}`);
    if (peerCount >= 2 && pc && pc.signalingState === 'stable') {
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
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket?.emit('sdp-offer', sasCode, offer);
  } catch (err) {
    log(`createOffer error: ${err}`);
  }
}

function sendData(data: Uint8Array): boolean {
  if (dataChannel?.readyState === 'open') {
    dataChannel.send(data as Uint8Array<ArrayBuffer>);
    return true;
  }
  return false;
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
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (keepalivePort) {
    keepalivePort.disconnect();
    keepalivePort = null;
  }
  sasCode = null;
  turnCredentials = null;
  reconnectAttempt = 0;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'webrtc-start-pairing':
      (async () => {
        sasCode = message.payload.sasCode as string;
        turnCredentials = await fetchTurnCredentials();
        setupPeerConnection();
        connectSignaling(sasCode);
      })().catch((err) => log(`Start pairing error: ${err}`));
      sendResponse({ success: true });
      break;
    case 'webrtc-send':
      if (message.payload?.data) {
        sendData(new Uint8Array(message.payload.data as number[]));
      }
      break;
    case 'webrtc-disconnect':
      disconnect();
      break;
  }
  return false;
});

setupKeepalive();

log('Offscreen WebRTC initialized');
