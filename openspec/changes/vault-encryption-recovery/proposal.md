## Why

The current vault design has no recovery mechanism. If the user loses their phone, all credentials and the Smart-ID PIN vault are permanently lost. The user must re-pair a new phone and re-provision all credentials.

BIP39 seed phrase backup (existing design) is fragile: the user writes down 24 words on paper. If the paper is lost, destroyed, or the user forgets where they stored it, recovery is impossible. A single point of failure.

Shamir's Secret Sharing solves this by splitting the vault seed into 3 shares, any 2 of which can reconstruct the original seed:

- **Share 1**: Encrypted in `chrome.storage.sync` — accessible from any Chrome profile the user signs into
- **Share 2**: Printed as a recovery QR code — the user saves it (wallet, safe, photo)
- **Share 3**: Stored on the Android vault itself — for recovery to a new phone with the old phone present

This creates a 2-of-3 scheme: the user can recover with any two shares. Lose the phone? Use Share 1 (Chrome sync) + Share 2 (QR code). Lost the QR? Use Share 1 + old phone (Share 3). Lost everything? That requires all three, which is the same as the current single point of failure — but the probability of losing any two out of three is dramatically lower.

## What Changes

- **Shamir's Secret Sharing (2-of-3)**: During initial pairing, the extension generates a 256-bit vault seed and splits it into 3 shares using Shamir's Secret Sharing over GF(256). Threshold = 2, meaning any 2 shares reconstruct the seed.
- **Share 1 — Chrome Sync**: Encrypted with a key derived from the user's Chrome profile (no additional password). Stored in `chrome.storage.sync`.
- **Share 2 — Recovery QR**: Displayed as a printable QR code during setup. The user saves this offline (physical print, screenshot in secure location).
- **Share 3 — Android Vault**: Transmitted over the transport channel to the Android vault for local encrypted storage.
- **Recovery Flow**: New phone scans the recovery QR (Share 2) → extension retrieves Share 1 from Chrome sync → reconstructs vault seed → initiates pairing with new phone using reconstructed key → old phone added to revocation list.
- **Revocation Merkle Tree**: When a device is revoked, its device ID is added to a signed Merkle tree. The extension includes a Merkle proof in every command. Devices verify the proof and reject commands from revoked peers.

## Capabilities

### New Capabilities

- `shamir-secret-sharing`: 2-of-3 split of vault seed during pairing — Chrome sync, recovery QR, Android vault each hold one share
- `recovery-qr`: Printable QR code containing Share 2 for offline backup
- `recovery-flow`: Reconstruct vault seed from any 2 shares → re-pair new phone
- `revocation-merkle-tree`: Signed Merkle tree of revoked device IDs, proved per-command

### Modified Capabilities

- `vault-encryption`: Master key now derived from Shamir-reconstructed seed (not independently generated)
- `seed-phrase-backup`: BIP39 seed phrase becomes optional (user can choose Shamir OR BIP39 OR both)
- `disaster-recovery`: Recovery from Shamir shares added as additional path alongside BIP39

## Impact

- **Browser extension**: `lib/recovery/shamir.ts` — GF(256) polynomial evaluation, share splitting, share reconstruction. `lib/recovery/merkle.ts` — Merkle tree for device revocation proofs. Total: ~300 lines.
- **Recovery QR**: Printed page with QR code containing Share 2. User instructions: "Keep this QR code safe — anyone with this QR and access to your Chrome profile can recover your vault."
- **Android vault**: Store Share 3 in EncryptedSharedPreferences. On recovery to new phone, transmit Share 3 over transport channel.
- **Chrome storage**: Share 1 stored in `chrome.storage.sync`, encrypted with profile-derived key. Auto-synced to all Chrome instances.
- **Performance**: Shamir split/reconstruct over GF(256) for 256-bit seed takes <10ms. Merkle proof generation for 1000 device IDs takes <50ms.

## Dependencies

- Shamir implementation: Pure TypeScript (no external crypto libraries). Uses GF(256) arithmetic with lookup tables for performance.
- Recovery flow: Requires `chrome.storage.sync` to be available (signed-in Chrome profile). If user is not signed in, Share 1 cannot be stored — only Share 2 (QR) and Share 3 (phone) are available. Recovery still works with QR + phone.
- Revocation Merkle tree: Requires all paired devices to validate Merkle proofs. Android app must support Merkle proof verification.
