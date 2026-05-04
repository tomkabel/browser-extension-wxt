## Why

The extension currently supports pairing with only a single phone. If the user wants to pair a second phone (work + personal, or replacement device), they must factory-reset the extension and re-pair from scratch, losing all credential state.

Additionally, there is no recovery mechanism if the user loses their phone — the vault seed and all credentials become permanently inaccessible. The Shamir recovery system addresses this by splitting the vault seed into 3 shares, any 2 of which can reconstruct it.

The core additions:
1. **Multi-device registry**: Support up to 5 paired phones, switchable from the popup
2. **Signed revocation**: Cryptographically revoke a lost device, preventing future connections
3. **Revocation Merkle tree**: Every command includes a Merkle proof that the sender is not revoked
4. **Recovery flow**: Use Shamir shares to recover the vault seed and re-pair a new phone

## What Changes

- **Device registry**: `DeviceRecord[]` in `chrome.storage.session` with automatic dual-storage (session + local shadow copy). Max 5 devices.
- **Device switching UI**: Popup shows all paired devices, tap to switch active device. Disconnects current transport, initiates IK handshake with selected device's stored static key.
- **Signed revocation**: Extension rotates its Noise keypair, broadcasts signed revocation to the signaling server, adds revoked device to Merkle tree. Revoked devices cannot connect.
- **Recovery flow integration**: New UI option "Recover from backup" accepting Shamir shares (QR scan + Chrome sync + old phone). Reconstructs vault seed, derives new Noise keypair, initiates pairing with new phone.
- **Forget device recovery**: If user still has the lost phone's physical access, "Forget device" sends a revocation signal before removing.

## Capabilities

### New Capabilities

- `device-registry`: Multi-device support (up to 5 phones) with dual-storage persistence
- `device-switching-ui`: Popup device list with active device indicator and tap-to-switch
- `signed-revocation`: Extension key rotation + revocation broadcast + signaling server blacklist
- `revocation-merkle-tree`: Merkle proof per command — revoked devices rejected
- `recovery-flow`: Shamir share-based vault recovery and re-pairing

### Modified Capabilities

- `active-device-routing`: All commands routed to currently active device's transport
- `pairing-flow`: New phone pairing triggers Shamir share generation (if not already done)
- `signaling-server`: Added revocation blacklist with 24h TTL

## Impact

- **Browser extension**: `lib/pairing/deviceRegistry.ts` — CRUD for device records. `lib/recovery/merkle.ts` — Merkle tree for revocation proofs. Popup device list panel. ~400 lines total.
- **Signaling server**: In-memory revocation blacklist. New endpoint `POST /revoke` for revocation broadcast.
- **Android**: Verify Merkle proofs before processing commands. Store revocation root.
- **Recovery QR**: Printable QR during setup (Share 2 of 3). User instructions included.

## Dependencies

- Device registry: `chrome.storage.session` + `chrome.storage.local` shadow copy.
- Revocation: Requires connected signaling server for broadcast. Offline revocation: cached and broadcast on next connection.
- Recovery: Requires Shamir SSS implementation (`lib/recovery/shamir.ts`). Share distribution requires Chrome sync, QR printing, and Android transport.
