import { createServer } from 'node:http';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
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
  }, ROOM_TTL_MS);
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
      res.end(JSON.stringify({ error: 'TURN credentials unavailable: TURN_SECRET not configured' }));
      return;
    }
    pendingCredentials.set(roomId, credentials);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(credentials));
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
  socket.on('join-room', (sasCode) => {
    if (!sasCode || !isValidSasCode(sasCode)) {
      socket.emit('error', { message: 'Invalid room code' });
      return;
    }

    const roomId = ROOM_PREFIX + sasCode;
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
