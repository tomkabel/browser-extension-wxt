import { createServer } from 'node:http';
import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { Server } from 'socket.io';

const PORT = parseInt(process.env.PORT ?? '7333', 10);
const TURN_SECRET = process.env.TURN_SECRET;
const TURN_SERVERS = (process.env.TURN_SERVERS ?? 'turn:localhost:3478').split(',');
const ROOM_PREFIX = 'smartid2::';
const ROOM_TTL_MS = 30_000;
const TURN_CREDENTIAL_TTL = 300; // 5 minutes in seconds

// Accept numeric (6-digit) and emoji (3-char) SAS codes
const SAS_NUMERIC_RE = /^\d{6}$/;
const SAS_EMOJI_RE = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]{3}$/u;

const rooms = new Map();
const pendingCredentials = new Map();
const roomMetadata = new Map();
const revokedDevices = new Map();
const REVOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const REVOCATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [deviceId, expiry] of revokedDevices) {
    if (now > expiry) {
      revokedDevices.delete(deviceId);
    }
  }
}, REVOCATION_CLEANUP_INTERVAL_MS);

function isDeviceRevoked(deviceId) {
  const expiry = revokedDevices.get(deviceId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    revokedDevices.delete(deviceId);
    return false;
  }
  return true;
}

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { peers: new Set(), timeout: null };
    rooms.set(roomId, room);
  }
  return room;
}

function clearTimeout_(room) {
  if (room.timeout) {
    clearTimeout(room.timeout);
    room.timeout = null;
  }
}

function scheduleCleanup(roomId, room) {
  clearTimeout_(room);
  room.timeout = setTimeout(() => {
    rooms.delete(roomId);
    pendingCredentials.delete(roomId);
    roomMetadata.delete(roomId);
  }, ROOM_TTL_MS);
}

function verifyCommitment(metadata, commitment) {
  if (!commitment || typeof commitment !== 'string') return false;
  if (!metadata.extensionStaticKey || !Array.isArray(metadata.extensionStaticKey)) return false;
  if (!metadata.nonce || !Array.isArray(metadata.nonce)) return false;
  if (metadata.nonce.length !== 32) return false;
  if (typeof metadata.sasCode !== 'string') return false;

  const hash = createHash('sha256');
  const extKey = Buffer.from(metadata.extensionStaticKey);
  const nonceBuf = Buffer.from(metadata.nonce);
  const sasBuf = Buffer.from(metadata.sasCode, 'utf-8');
  hash.update(Buffer.concat([extKey, nonceBuf, sasBuf]));
  const expected = hash.digest('base64url');
  const commitmentBuf = Buffer.from(commitment);
  const expectedBuf = Buffer.from(expected);
  if (commitmentBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(commitmentBuf, expectedBuf);
}

function isValidSasCode(sasCode) {
  return SAS_NUMERIC_RE.test(sasCode) || SAS_EMOJI_RE.test(sasCode);
}

function generateTurnCredentials(roomId) {
  if (!TURN_SECRET) {
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL;
  const username = `${timestamp}:${roomId}`;
  const hmac = createHmac('sha1', TURN_SECRET);
  hmac.update(username);
  const password = hmac.digest('base64');

  return {
    username,
    password,
    ttl: TURN_CREDENTIAL_TTL,
    urls: TURN_SERVERS.map((s) => `turn:${s}`),
    stunUrls: TURN_SERVERS.map((s) => `stun:${s}`),
  };
}

const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/turn-credentials') {
    const roomId = req.headers['x-room-id'];
    if (!roomId || typeof roomId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing x-room-id header' }));
      return;
    }
    const credentials = generateTurnCredentials(roomId);
    if (!credentials) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: 'TURN credentials unavailable: TURN_SECRET not configured' }),
      );
      return;
    }
    pendingCredentials.set(roomId, credentials);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(credentials));
    return;
  }

  if (req.method === 'POST' && req.url === '/revoke') {
    const REVOKE_SECRET = process.env.REVOKE_SECRET;
    if (REVOKE_SECRET) {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing authorization header' }));
        return;
      }
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { deviceId } = JSON.parse(body);
        if (!deviceId || typeof deviceId !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid deviceId' }));
          return;
        }

        if (REVOKE_SECRET) {
          const authHeader = req.headers['authorization'];
          const expectedHmac = createHmac('sha256', REVOKE_SECRET).update(deviceId).digest('hex');
          const expected = `Bearer ${expectedHmac}`;
          if (
            !authHeader ||
            authHeader.length !== expected.length ||
            !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
          ) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid authorization' }));
            return;
          }
        }

        revokedDevices.set(deviceId, Date.now() + REVOCATION_TTL_MS);
        console.log(`Device revoked via HTTP: ${deviceId}`);

        for (const [, socket] of io.sockets.sockets) {
          const socketDeviceId = socket.handshake.query?.deviceId;
          if (socketDeviceId === deviceId) {
            socket.emit('error', { message: 'Device revoked' });
            socket.disconnect(true);
            console.log(`Disconnected revoked device socket: ${deviceId}`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deviceId }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
});

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10_000,
  pingTimeout: 5_000,
});

io.on('connection', (socket) => {
  const deviceId = socket.handshake.query?.deviceId;
  if (deviceId && isDeviceRevoked(deviceId)) {
    socket.emit('error', { message: 'Device revoked' });
    socket.disconnect(true);
    return;
  }

  socket.on('register-room', (data) => {
    const { sasCode, nonce, extensionStaticKey, roomId } = data;
    if (!sasCode || !isValidSasCode(sasCode) || !roomId) {
      socket.emit('error', { message: 'Invalid register-room data' });
      return;
    }
    if (!Array.isArray(nonce) || nonce.length !== 32) {
      socket.emit('error', { message: 'Invalid nonce: must be 32-byte array' });
      return;
    }
    if (!Array.isArray(extensionStaticKey) || extensionStaticKey.length < 32) {
      socket.emit('error', {
        message: 'Invalid extensionStaticKey: must be at least 32-byte array',
      });
      return;
    }

    roomMetadata.set(roomId, {
      sasCode,
      nonce,
      extensionStaticKey,
      createdAt: Date.now(),
    });

    const room = getRoom(roomId);
    clearTimeout_(room);
    socket.join(roomId);
    room.peers.add(socket.id);

    const turnCreds = pendingCredentials.get(roomId);
    socket.emit('room-joined', {
      peerCount: room.peers.size,
      turnCredentials: turnCreds ?? undefined,
    });
  });

  socket.on('join-room', (sasCode) => {
    if (!sasCode || !isValidSasCode(sasCode)) {
      socket.emit('error', { message: 'Invalid room code' });
      return;
    }

    const roomId = ROOM_PREFIX + sasCode;
    const metadata = roomMetadata.get(roomId);
    if (!metadata) {
      socket.emit('error', { error: 'room_not_ready' });
      socket.disconnect(true);
      return;
    }
    const commitment = socket.handshake.query?.commitment;
    if (!commitment || !verifyCommitment(metadata, commitment)) {
      socket.emit('error', { error: 'invalid_commitment' });
      socket.disconnect(true);
      return;
    }

    const room = getRoom(roomId);
    clearTimeout_(room);

    socket.join(roomId);
    room.peers.add(socket.id);

    const turnCreds = pendingCredentials.get(roomId);
    socket.emit('room-joined', {
      peerCount: room.peers.size,
      turnCredentials: turnCreds ?? undefined,
    });
  });

  socket.on('sdp-offer', (sasCode, offer) => {
    if (!sasCode || !isValidSasCode(sasCode)) return;
    socket.to(ROOM_PREFIX + sasCode).emit('sdp-offer', offer);
  });

  socket.on('sdp-answer', (sasCode, answer) => {
    if (!sasCode || !isValidSasCode(sasCode)) return;
    socket.to(ROOM_PREFIX + sasCode).emit('sdp-answer', answer);
  });

  socket.on('ice-candidate', (sasCode, candidate) => {
    if (!sasCode || !isValidSasCode(sasCode)) return;
    socket.to(ROOM_PREFIX + sasCode).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms) {
      if (room.peers.has(socket.id)) {
        room.peers.delete(socket.id);
        if (room.peers.size === 0) {
          scheduleCleanup(roomId, room);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`SmartID2 signaling server listening on port ${PORT}`);
  if (!TURN_SECRET) {
    console.warn('WARNING: TURN_SECRET not set. TURN credentials endpoint disabled.');
  }
});
