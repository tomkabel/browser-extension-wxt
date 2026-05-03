# Technical Architecture & Design

## Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser Extension                               │
│                                                                         │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────────┐ │
│  │ Content Script│───▶│ Background SW    │───▶│ REST API              │ │
│  │ (per tab)     │    │ (message router) │    │ (configured endpoint) │ │
│  │  - scraper    │    │  - tab state     │    └───────────────────────┘ │
│  │  - detector   │    │  - session mgr   │                              │
│  │  - rate limit │    │  - API relay     │    ┌───────────────────────┐ │
│  └──────┬───────┘    │  - pairing svc   │───▶│ WebRTC via Offscreen  │ │
│         │            └──────────────────┘    │ Document               │ │
│         │                                     │  - DataChannel (Noise)│ │
│         │                                     │  - Socket.io Signal   │──▶ Signaling Server
│         ▼                                     └───────────────────────┘ │
│  ┌──────────────┐                                                       │
│  │ Popup (React)│── runtime.sendMessage                                 │
│  │  - Pairing   │                                                       │
│  │  - Auth      │                                                       │
│  │  - Tx Verify │                                                       │
│  └──────────────┘                                                       │
│                                                                         │
│  ┌──────────────────────────────────────┐                               │
│  │ Auth Page (WebAuthn / FIDO2)         │                               │
│  │  - Register credential              │── runtime.sendMessage ────▶   │
│  │  - Authenticate + activate session  │  'mfa-assertion'              │
│  └──────────────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Proposed Schema Changes

### Session Persistence (`sessionManager.ts`)

```typescript
interface PersistedMfaSession {
  sessionToken: string;
  mfaVerifiedAt: number;
  expiry: number;
  deviceName?: string;
  persistedAt: number; // wall-clock timestamp of when local backup was written
}
```

Storage keys:
- `storage.session` → `mfa:session` (primary, volatile)
- `storage.local` → `mfa:session:persisted` (backup, survives SW restart)

### Environment Variable Schema

```bash
# .env.example — required for production builds
VITE_API_ENDPOINT=https://your-api.example.com
VITE_SIGNALING_URL=https://smartid2-signaling.fly.dev
```

### Error Boundary Schema

```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}
```

## Message Protocol Changes

### Updated `verify-transaction` flow

```
Popup                       Background                         Phone
  │                            │                                  │
  ├── verify-transaction ─────▶│                                  │
  │                            ├── commandClient                  │
  │                            │   .sendAuthenticateTransaction() │
  │                            │      │                           │
  │                            │      ├── encodeMessage()         │
  │                            │      ├── pending.set(seq, ...)   │
  │                            │      ├── sendData(encoded) ─────▶│
  │                            │      │                           │
  │                            │      │          ControlResponse  │
  │                            │      │◀──────────────────────────│
  │                            │      │                           │
  │                            │      ├── handleIncomingResponse()│
  │                            │      │   └── pending.get(seq)    │
  │                            │      │   └── entry.resolve(resp) │
  │                            │      │                           │
  │                            ├── response.success/error         │
  │◀───────────────────────────┤                                  │
```

## Key Rotation Protocol (Command Client)

```typescript
const ROTATION_THRESHOLD = 1000; // messages
// After 1000 messages, call keyRotationProvider.rotate(count)
// This triggers a new Noise IK handshake to rotate the transport key
```

## Rate Limiting Architecture

```
checkRateLimit() per content script instance:
  Window: 60s
  Max: 10 requests
  Backoff: 30s * 2^(excess), capped at 5min

Per-background (new instance for mfa-assertion):
  Window: 60s
  Max: 3 requests
  Replay window: reject identical assertion tuples within 5min
```
