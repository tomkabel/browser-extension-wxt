## 0. Shamir Secret Sharing

- [ ] 0.1 Implement `lib/recovery/shamir.ts`: GF(256) arithmetic with lookup tables for multiplication
- [ ] 0.2 Implement `splitSecret(seed: Uint8Array, n: number, k: number): Uint8Array[]` using Shamir's scheme
- [ ] 0.3 Implement `reconstructSecret(shares: Uint8Array[]): Uint8Array` using Lagrange interpolation
- [ ] 0.4 Unit test: split 256-bit seed into 3 shares (2-of-3), reconstruct from any 2 shares = original
- [ ] 0.5 Unit test: reconstruction from only 1 share produces wrong output
- [ ] 0.6 Unit test: reconstruction from 3 shares = original
- [ ] 0.7 Unit test: GF(256) arithmetic is correct (multiplication table consistency)

## 0B. Recovery Share Distribution

- [ ] 0B.1 Implement Share 1 storage: encrypt with profile-derived key, store in `chrome.storage.sync` as `recovery:share1`
- [ ] 0B.2 Implement Share 2 QR display: printable page with QR code encoding `smartid2-recovery://v1/<base64url(share2)>`
- [ ] 0B.3 Implement Share 3 transmission: send over Noise-encrypted transport channel to Android vault
- [ ] 0B.4 Unit test: share encrypt/decrypt roundtrip
- [ ] 0B.5 Unit test: QR encoding/decoding roundtrip

## 0C. Recovery Flow

- [ ] 0C.1 Implement `lib/recovery/recovery.ts`: orchestrate reconstruction from any 2 share sources
- [ ] 0C.2 Derive Noise keypair from reconstructed seed: `SHA-256(seed || "noise-keypair")`
- [ ] 0C.3 Implement recovery UI: "Recover from backup" flow with QR scan + Chrome sync check + phone connect
- [ ] 0C.4 Integrate with pairing flow: after recovery, initiate pairing with new phone
- [ ] 0C.5 Unit test: full recovery flow with mocked share sources

## 0D. Revocation Merkle Tree

- [ ] 0D.1 Implement `lib/recovery/merkle.ts`: binary Merkle tree with SHA-256 leaves
- [ ] 0D.2 Implement `generateMerkleProof()` and `verifyMerkleProof()` functions
- [ ] 0D.3 Add Merkle root signing: sign root with current Noise static key
- [ ] 0D.4 Include Merkle proof in every command payload
- [ ] 0D.5 Persist revocation list to `chrome.storage.local`, rebuild Merkle tree on restart
- [ ] 0D.6 Unit test: proof generation and verification
- [ ] 0D.7 Unit test: revoked device proof fails verification

## 1. Implement Android Keystore Master Key

- [ ] 1.1 Create `VaultKeyManager.kt`: generate AES-256-GCM key in Android Keystore with biometric auth requirement and enrollment invalidation
- [ ] 1.2 Expose `getMasterKey(): SecretKey` — returns key for use within 60s of biometric auth
- [ ] 1.3 Unit test: master key is generated, stored, and retrievable
- [ ] 1.4 Unit test: master key is invalidated on biometric enrollment change (mock Keystore)

## 2. Implement HKDF Key Derivation

- [ ] 2.1 Create `CredentialKeyDeriver.kt`: `HKDF-SHA256(ikm=masterKey.encoded, salt=UTF-8(domain), info="smartid2-credential-v1")`
- [ ] 2.2 Use `Mac` with `HmacSHA256` for HKDF expand step
- [ ] 2.3 Unit test: same domain + same master key → same derived key
- [ ] 2.4 Unit test: different domains → different derived keys
- [ ] 2.5 Unit test: derived key is exactly 256 bits

## 3. Implement Credential Encryption/Decryption

- [ ] 3.1 Create `CredentialCipher.kt`: `encrypt(domain, plaintext): { ciphertext, iv }` and `decrypt(domain, ciphertext, iv): plaintext`
- [ ] 3.2 Generate 12 random bytes for IV via `SecureRandom`
- [ ] 3.3 Use AES-256-GCM with the per-domain derived key
- [ ] 3.4 Unit test: encrypt-decrypt roundtrip produces original plaintext
- [ ] 3.5 Unit test: decrypt with wrong domain key fails (authentication tag mismatch)

## 4. Implement Vault SQLite Storage

- [ ] 4.1 Create database schema matching spec (domain PK, username plaintext, ciphertext BLOB, iv BLOB, created_at, updated_at)
- [ ] 4.2 Implement `saveCredential(domain, username, password)` — encrypts password, upserts to DB
- [ ] 4.3 Implement `getCredential(domain): { username, password }?` — decrypts ciphertext
- [ ] 4.4 Implement `deleteCredential(domain)` and `listDomains(): string[]`
- [ ] 4.5 Unit test: save and retrieve credential
- [ ] 4.6 Unit test: update existing credential updates `updated_at`

## 5. Implement Seed Phrase Backup (Optional)

- [ ] 5.1 Integrate BIP39 mnemonic library
- [ ] 5.2 Generate 256-bit entropy → 24-word seed phrase
- [ ] 5.3 Display seed phrase ONCE on screen; user confirms 3 random words
- [ ] 5.4 Derive vault key from seed: `HKDF-SHA256(Bip39MnemonicToSeed(phrase), "smartid2-vault-v1")`
- [ ] 5.5 Implement `exportBackup()`: serialize all credentials → AES-256-GCM encrypt with vault key → write to device cloud storage
- [ ] 5.6 Unit test: export → import produces identical credentials
- [ ] 5.7 Unit test: wrong seed phrase fails to decrypt backup

## 6. Implement Disaster Recovery

- [ ] 6.1 Implement `restoreFromSeed(seedPhrase)`: download backup from cloud, decrypt with vault key, re-encrypt all credentials with NEW master key
- [ ] 6.2 On restore: generate new Android Keystore master key, derive new per-domain keys, re-encrypt all credentials
- [ ] 6.3 Unit test: full restore flow from Shamir shares (any 2 of 3)
- [ ] 6.4 Unit test: restore from BIP39 seed phrase
- [ ] 6.5 Unit test: restore with wrong shares does not modify existing vault state

## 7. Final Verification

- [ ] 7.1 Run all unit tests (extension + Android)
- [ ] 7.2 Manual QA: full vault lifecycle (pair → create shares → lose phone → recover from QR + Chrome sync → verify credential accessible)
