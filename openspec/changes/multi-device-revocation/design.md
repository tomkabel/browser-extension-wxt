## Context

Multi-device support and recovery are the two most requested features for the SmartID2 vault. Users want to:
1. Pair a second phone (work + personal)
2. Switch between phones depending on which is in hand
3. Recover if a phone is lost — without losing access to credentials

The design integrates three systems:
- **Device registry**: Tracks up to 5 paired phones with static keys for IK reconnection
- **Revocation system**: Signed revocation + Merkle tree proofs prevent lost/stolen devices from accessing the vault
- **Recovery system**: Shamir 2-of-3 secret sharing across Chrome sync, QR code, and old phone

### System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Extension                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Device   │  │ Active   │  │ Merkle   │  │ Shamir  │ │
│  │ Registry │  │ Device   │  │ Tree     │  │ Shares  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│       │              │             │              │      │
│       ▼              ▼             ▼              ▼      │
│  chrome.storage   Transport    Command        chrome.   │
│  (session+local)  Manager      Interceptor    storage   │
│                                                   .sync  │
└──────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- Support up to 5 paired phones in device registry
- Switch active device via popup UI (tap to switch)
- Signed revocation with Noise key rotation
- Merkle proof in every command — revoked devices rejected
- Recovery from Shamir shares (any 2 of 3)
- Recovery QR code printed during setup
- Dual-storage persistence (session + local shadow)

**Non-Goals:**
- Unlimited device count (5 is practical for consumer use)
- Automatic failover between devices (user-initiated switching)
- Revocation without network access (queued for next connection)
- BIP39 seed phrase as primary recovery (Shamir is primary, BIP39 is optional alternative)

## Decisions

### Decision 1: Device Registry Structure

```typescript
interface DeviceRecord {
  deviceId: string;           // First 16 hex chars of SHA-256(phoneStaticKey)
  name: string;               // User-configurable phone name
  phoneStaticKey: Uint8Array; // Phone's Noise static public key
  lastSeen: number;           // Epoch timestamp
  pairedAt: number;           // Epoch timestamp
  isPrimary: boolean;         // First paired device is primary
}
```

Stored in `chrome.storage.session` (key: `pairing:devices`) with a shadow copy in `chrome.storage.local` for persistence across browser restarts. Max 5 devices — attempting to pair a 6th shows "Maximum devices reached. Remove a device first."

### Decision 2: Device Switching Flow

```
1. User opens popup → sees device list
2. User taps secondary device
3. Popup sends 'switch-device' message to background
4. Background:
   a. Disconnects current transport
   b. Reads selected device's `phoneStaticKey` from registry
   c. Initiates IK Noise handshake with stored key
   d. Routes TransportManager to the new WebRTC connection
5. Popup updates active device indicator
```

IK handshake (2 messages) is used instead of full XX (3 messages) because both sides already know each other's static keys from initial pairing.

### Decision 3: Signed Revocation with Merkle Tree

When a user revokes a device:

```
1. Extension generates new Noise static keypair
2. Old keypair signed message: { type: "revoke", deviceId, ts }
3. Device ID added as leaf to Merkle tree
4. Merkle root signed with NEW keypair
5. Revocation broadcast to signaling server
6. Old device removed from registry
7. Signaling server adds deviceId to blacklist (24h TTL)
```

Every command includes a Merkle proof:

```typescript
interface CommandPayload {
  type: string;
  data: unknown;
  merkleProof: string[];   // Sibling hashes from leaf to root
  merkleRoot: Uint8Array;  // Current Merkle root
}
```

The receiver verifies:
1. Compute `SHA-256(senderDeviceId)` → leaf hash
2. Combine with `merkleProof` → recompute root
3. Assert `recomputedRoot === merkleRoot`
4. Assert `merkleRoot` is signed by a trusted key

### Decision 4: Recovery Integration

Recovery is initiated from the popup via "Recover from backup":

```
1. User selects "Recover from backup"
2. Step 1: Obtain Share 1 (scan QR) OR Share 3 (connect old phone)
3. Step 2: Extension automatically retrieves Share 1 from Chrome sync (if available)
4. After 2 shares collected:
5.   reconstruct seed = shamir.reconstruct([shareA, shareB])
6.   newKeypair = deriveNoiseKeypair(SHA-256(seed || "noise-keypair"))
7.   Extension initiates pairing with new phone using newKeypair
8.   On pairing complete:
9.     old phone deviceId → added to revocation Merkle tree
10.    Recovery complete — user can now access vault with new phone
```

### Decision 5: Signaling Server Revocation Blacklist

The signaling server maintains an in-memory set of revoked device IDs:

```javascript
const revokedDevices = new Set(); // deviceId strings
// TTL: 24 hours (periodic cleanup)
setInterval(() => revokedDevices.clear(), 24 * 60 * 60 * 1000);

// On connection
io.on('connection', (socket) => {
  const deviceId = socket.handshake.query.deviceId;
  if (revokedDevices.has(deviceId)) {
    socket.emit('error', { message: 'Device revoked' });
    socket.disconnect();
    return;
  }
});
```

Revocation messages received from authenticated extensions are broadcast to all connected peers. If the signaling server is unreachable at revocation time, the revocation is cached and broadcast on next connection.

## Risks / Trade-offs

- [Risk] Dual-storage (session + local) can get out of sync — On every mutation, write to both. On background startup, reconcile: local copy is source of truth for persistence, session copy for runtime access.
- [Risk] Merkle proof adds ~500 bytes per command — For credential auto-fill commands (<100 bytes), this is significant overhead. Mitigation: cache verified proofs per-session; only send full proof on first command, subsequent commands send `{ merkleRoot }` only.
- [Risk] Signaling server blacklist is ephemeral — If the server restarts, the blacklist is lost. Revoked devices could reconnect. Mitigation: persistence to Redis or SQLite on the signaling server. For Phase 1, the Merkle tree provides offline safety — the signaling server blacklist is a secondary defense.
- [Risk] User loses ALL shares — With 2-of-3 Shamir, this requires losing both Chrome sync access AND the QR code AND the old phone. If all three are lost, recovery is impossible — same as BIP39 seed loss. Acceptable: the user must maintain at least 2 of 3 recovery methods.
