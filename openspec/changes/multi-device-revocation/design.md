## Context

The pairing system is a single-device state machine. `pairing:device` in `chrome.storage.session` holds exactly one device. There's no way to pair a second phone, switch between devices, or revoke a lost phone's pairing. The signaling server has no concept of device identity beyond the ephemeral room ID.

## Goals / Non-Goals

**Goals:**
- Device registry in `chrome.storage.session`: store multiple paired devices with ID, name, static key fingerprint, lastSeen
- Popup device list panel: show all paired phones, highlight active, allow switching
- Route credential/transaction requests to the active device
- Signed revocation: extension broadcasts signed message to signaling server; server blacklists deviceId
- Key rotation: extension generates new Noise static keypair on revocation; old keypair discarded
- Phone-side: companion app generates new Noise keypair when pairing is revoked

**Non-Goals:**
- Simultaneous broadcast to all devices
- Device grouping or priority tiers
- Remote wipe of phone vault

## Decisions

### Decision 1: Device registry structure

```typescript
interface DeviceRecord {
  deviceId: string;            // SHA-256(phoneStaticKey) first 16 hex chars
  name: string;                // User-assigned during pairing ("My Pixel 8")
  phoneStaticKey: Uint8Array;  // Phone's Noise static public key
  publicKey: Uint8Array;       // Passkey public key (if provisioned)
  lastSeen: number;            // Unix timestamp
  pairedAt: number;            // Unix timestamp
  isPrimary: boolean;          // Only one primary device
}
```
Stored as `devices: DeviceRecord[]` in `chrome.storage.session`. Max 5 devices (arbitrary limit to prevent registry bloat on ephemeral session storage).

### Decision 2: Device switching flow

The popup shows a device list with radio-button selection. Switching devices:
1. Deactivates the current transport (WebRTC close or USB disconnect)
2. If the target device has no active transport, initiates a new connection using stored `phoneStaticKey` (IK handshake — the extension already knows the phone's static key)
3. Updates `storage.session` active device pointer
4. Route all subsequent `commandClient.sendCredentialRequest()` etc. through the new transport

### Decision 3: Signed revocation protocol

When the user clicks "Forget Device" in popup:
```
1. Extension generates new Noise static keypair:
   newSK, newPK = Noise.generateKeyPair()

2. Extension broadcasts:
   { type: "revoke", deviceId, signature: sign(oldSK, "revoke:" + deviceId) }

3. Extension replaces its Noise static key:
   storage.session: noiseKeyPair = { publicKey: newPK, privateKey: newSK }

4. Signaling server marks deviceId as revoked (in-memory set, TTL 24h)
5. All active transports for revoked device are closed

6. The companion app, on next connection attempt, receives revocation
   acknowledgment and regenerates its own keypair.
```

Key rotation on revocation is critical — it ensures the lost phone cannot decrypt any future communication even if it retained its keys.

## Risks / Trade-offs

- [Risk] Session storage is ephemeral — device registry is lost on browser close. Mitigation: store device metadata (not keys) in `chrome.storage.local` for re-population. Keys are regenerated on re-pair or restored via WebAuthn PRF.
- [Risk] Key rotation invalidates all pairings — The extension's new public key won't match any phone's stored `extensionStaticKey`. Mitigation: after rotation, the extension sets its own state to "unpaired" and requires re-pairing with all phones.
- [Risk] Revocation message is unauthenticated at the server level — The signature provides authenticity. The server only needs to verify the signature against the claimed device ID's previously registered public key.
