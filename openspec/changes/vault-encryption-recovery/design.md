## Context

The vault encryption and recovery system must balance three requirements:
1. **Security**: Master key must be hardware-backed, biometric-gated, and cryptographically isolated
2. **Recoverability**: User must be able to restore the vault if the phone is lost, destroyed, or stolen
3. **Simplicity**: Recovery must not require memorizing 24 words or managing complex key material

The solution combines:
- **Android Keystore** for runtime master key protection (biometric-gated AES-256-GCM)
- **Shamir's Secret Sharing** for disaster recovery (2-of-3 split across independent storage locations)
- **Optional BIP39 seed phrase** as an additional backup mechanism for advanced users

### Recovery Architecture

```
                        Vault Seed (256-bit CSPRNG)
                               │
                    Shamir SSS (2-of-3)
                    ┌────┬────┬────┐
                    │ S1 │ S2 │ S3 │
                    └─┬──┴─┬──┴─┬──┘
                      │    │    │
               ┌──────┘    │    └──────────┐
               ▼           ▼               ▼
        Chrome Sync    Recovery QR    Android Vault
       (encrypted)    (printed page)  (encrypted local)

Recovery Paths:
  Lost phone:     S1 (Chrome) + S2 (QR)     → reconstruct
  Lost QR:        S1 (Chrome) + S3 (old phone) → reconstruct
  New Chrome:     S2 (QR) + S3 (phone)       → reconstruct
  Everything:     All 3 required             → same as BIP39
```

## Goals / Non-Goals

**Goals:**
- Shamir 2-of-3 split of vault seed during initial pairing
- Share 1 encrypted in `chrome.storage.sync` (profile-derived key)
- Share 2 printable recovery QR code
- Share 3 transmitted to Android vault for encrypted local storage
- Recovery flow: any 2 shares → reconstruct seed → re-pair new phone
- Optional BIP39 24-word seed phrase as alternative backup
- Android Keystore master key with biometric gating (existing)
- Per-domain HKDF-derived encryption keys (existing)
- AES-256-GCM credential encryption (existing)
- SQLite credential storage with plaintext usernames (existing)
- Revocation Merkle tree for device revocation proofs

**Non-Goals:**
- Social recovery (third-party escrow of shares)
- Cloud backup of full vault (user data never leaves device except encrypted shares)
- Threshold > 2 (2-of-3 balances security and recoverability)
- Distributed key generation (seed is generated on the extension, not MPC)

## Decisions

### Decision 1: Shamir Secret Sharing over GF(256)

Use standard Shamir's Secret Sharing with GF(256) arithmetic:

```typescript
// Split a 256-bit seed into n shares, threshold k
function splitSecret(seed: Uint8Array, n: number, k: number): Uint8Array[] {
  // For each byte of the seed, create a polynomial of degree k-1
  // Evaluate at x=1..n to produce shares
  // Each share is a byte array of length 32 (seed bytes) + 1 (x value)
  const shares: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(33));
  for (let byteIdx = 0; byteIdx < seed.length; byteIdx++) {
    const poly = randomPolynomial(k - 1, seed[byteIdx]!); // constant term = seed byte
    for (let shareIdx = 0; shareIdx < n; shareIdx++) {
      const x = shareIdx + 1;
      shares[shareIdx]![byteIdx] = evaluatePolynomial(poly, x);
      shares[shareIdx]![32] = x; // store x value for reconstruction
    }
  }
  return shares;
}
```

GF(256) is chosen for efficiency: 256 bytes = 1 byte per evaluation point, lookup tables for multiplication, polynomial evaluation is O(k) per byte.

### Decision 2: Share Distribution

**Share 1 (Chrome Sync):** Encrypted with AES-256-GCM using a key derived from the user's Chrome synced profile (`chrome.storage.sync` is already encrypted by Chrome). Additional protection: the share plaintext is padded to 64 bytes and encrypted with an ephemeral key derived from `SHA-256(chrome.runtime.id + "share1")`.

Storage key: `recovery:share1` in `chrome.storage.sync`. Can be retrieved from any Chrome instance the user is signed into.

**Share 2 (Recovery QR):** Base64url-encoded and rendered as a QR code on a printable page. The QR code contains: `smartid2-recovery://v1/<base64url(share2)>`. User instructions: print this page and store it in a safe place (safe, safety deposit box, wallet photocopy).

**Share 3 (Android Vault):** Transmitted over the encrypted Noise transport channel. The Android app stores it in EncryptedSharedPreferences. Used when recovering with old phone + new Chrome.

### Decision 3: Recovery Flow

```
1. User installs extension on new computer, clicks "Recover from backup"
2. Extension prompts: "Scan your recovery QR code" (Share 2)
   OR "Connect your old phone" (Share 3)
   OR "Sign into Chrome to retrieve backup" (Share 1)
3. After obtaining any 2 shares:
4.   reconstruct seed = shamirReconstruct([shareA, shareB])
5.   Generate new static Noise keypair: keypair = SHA-256(seed || "noise-keypair")
6.   Initiate pairing with new phone using derived keypair
7.   On pairing complete: old phone signature verified → added to revocation Merkle tree
8.   User can now access vault with new phone
```

### Decision 4: Revocation Merkle Tree

When a device is revoked, its `deviceId` (SHA-256 hash of phone's static public key) is added to a binary Merkle tree:

```typescript
interface RevocationMerkleTree {
  root: Uint8Array;     // Current Merkle root
  leaves: string[];     // Revoked device IDs (hex)
  leavesByDeviceId: Map<string, { proof: string[]; index: number }>;
}

function generateMerkleProof(tree: RevocationMerkleTree, deviceId: string): string[] {
  // Returns sibling hashes from leaf to root
}

function verifyMerkleProof(root: Uint8Array, deviceId: string, proof: string[]): boolean {
  // Recompute hash from leaf + siblings → compare to root
}
```

Every command sent to a device includes a Merkle proof that the sender has not been revoked. Devices verify the proof before processing commands.

### Decision 5: BIP39 as Optional Alternative

The BIP39 24-word seed phrase backup remains available for advanced users who prefer it. The user chooses during initial setup:
- **Shamir (default)**: 2-of-3 split, no words to memorize
- **BIP39 (advanced)**: 24-word seed phrase, self-custody
- **Both**: Shamir shares + BIP39 phrase as additional fallback

## Risks / Trade-offs

- [Risk] `chrome.storage.sync` is encrypted by Chrome but accessible to any extension with the same storage key — Share 1 is additionally encrypted with a profile-derived key. Only the same Chrome profile can decrypt it.
- [Risk] QR code can be photographed or copied — Share 2 alone is insufficient to recover (needs Share 1 or Share 3). Treat the QR as a recovery key component, not a standalone secret.
- [Risk] GF(256) implementation must be constant-time to prevent side-channel attacks — Use lookup tables (not branching) for multiplication and polynomial evaluation.
- [Risk] Merkle tree grows unbounded — Practical limit: 10,000 leaves = ~14 levels = 14 hashes per proof = 448 bytes. Tree is stored in `chrome.storage.session` (RAM-only). On browser restart, tree is rebuilt from the device revocation list in `chrome.storage.local`.
- [Trade-off] BIP39 vs Shamir — BIP39 is more portable (any wallet software), but Shamir provides 2-of-3 recovery with no single point of failure. Offering both gives users choice.
