# SmartID2 Browser Extension

Secure transaction verification and credential management via phone-as-vault.

## Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [Node.js](https://nodejs.org/) 18+
- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) (for deploying signaling/TURN servers)

## Quick Start

```bash
bun install
cp .env.example .env   # fill in VITE_API_ENDPOINT and VITE_SIGNALING_URL
bun run dev
```

## TURN Server Setup

The TURN server provides relay connectivity when direct WebRTC peer-to-peer connections fail (corporate Wi-Fi, UDP-blocking firewalls, cellular hotspots).

### Deploy to Fly.io

```bash
cd turn-server

# Create the Fly app (one-time)
fly launch --name smartid2-turn --region fra --no-deploy

# Set the HMAC auth secret
fly secrets set TURN_SECRET=$(openssl rand -hex 32)

# Set the external IP for relay candidates
fly secrets set EXTERNAL_IP=$(fly ips list | grep 'v4' | awk '{print $2}')

# Deploy
fly deploy

# Verify
fly logs
```

The TURN server listens on:
- **UDP 3478** — TURN/UDP relay (preferred)
- **TCP 3478** — TURN/TCP fallback
- **TCP 443** — TURN/TCP for firewall traversal

### Configuration

| Env Var | Required | Description |
|---|---|---|
| `TURN_SECRET` | Yes | HMAC-SHA1 secret for ephemeral credential generation (shared with signaling server) |
| `EXTERNAL_IP` | Yes | Server's public IP for relay candidates |

## Signaling Server

The signaling server handles WebSocket-based SDP/ICE exchange and issues ephemeral TURN credentials.

### Deploy to Fly.io

```bash
cd signaling-server

# Create the Fly app (one-time)
fly launch --name smartid2-signaling --region fra --no-deploy

# Set required secrets
fly secrets set TURN_SECRET=$(openssl rand -hex 32)

# Set TURN server list (comma-separated, without protocol prefix)
fly secrets set TURN_SERVERS=smartid2-turn.fly.dev:3478

# Deploy
fly deploy
```

### Configuration

| Env Var | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: 7333) |
| `TURN_SECRET` | Yes | HMAC-SHA1 secret for TURN credential generation (must match TURN server) |
| `TURN_SERVERS` | No | Comma-separated TURN server addresses (default: `turn:localhost:3478`) |

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Health check |
| `/turn-credentials` | GET | Returns ephemeral TURN credentials (header: `x-room-id`) |

## ICE Candidate Waterfall

The WebRTC transport uses a silent fallback chain:

1. **mDNS / local candidates** — Direct peer-to-peer (lowest latency, <1ms)
2. **STUN** — NAT traversal for symmetric NATs
3. **TURN/UDP** — Relayed via TURN on UDP 3478
4. **TURN/TCP** — Relayed via TURN on TCP 443 (firewall traversal)

If connection drops, automatic reconnection runs with exponential backoff (1s → 2s → 4s → 8s → max 30s).

## Commands

| Command | Purpose |
|---|---|
| `bun run dev` | Start WXT dev server with HMR |
| `bun run build` | Prebuild validates env vars, then `wxt build`, then `fix-manifest.js` |
| `bun run test` | Unit/integration tests (Vitest) |
| `bun run test:e2e` | Playwright E2E |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run ci:check` | Full CI: typecheck → test → build |
| `bun run lint` | ESLint |
| `bun run format` | Prettier |

