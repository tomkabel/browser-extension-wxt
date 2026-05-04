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

## 5. Implement Seed Phrase Backup

- [ ] 5.1 Integrate BIP39 mnemonic library (e.g., `bip39` Java/Kotlin library)
- [ ] 5.2 Generate 256-bit entropy → 24-word seed phrase
- [ ] 5.3 Display seed phrase ONCE on screen; user confirms 3 random words
- [ ] 5.4 Derive vault key from seed: `HKDF-SHA256(Bip39MnemonicToSeed(phrase), "smartid2-vault-v1")`
- [ ] 5.5 Implement `exportBackup()`: serialize all credentials → AES-256-GCM encrypt with vault key → write to device cloud storage
- [ ] 5.6 Unit test: export → import produces identical credentials
- [ ] 5.7 Unit test: wrong seed phrase fails to decrypt backup

## 6. Implement Disaster Recovery

- [ ] 6.1 Implement `restoreFromSeed(seedPhrase)`: download backup from cloud, decrypt with vault key, re-encrypt all credentials with NEW master key
- [ ] 6.2 On restore: generate new Android Keystore master key, derive new per-domain keys, re-encrypt all credentials
- [ ] 6.3 Unit test: full restore flow from seed phrase
- [ ] 6.4 Unit test: restore with wrong seed phrase does not modify existing vault state

## 7. Final Verification

- [ ] 7.1 Run all Android companion app unit tests
- [ ] 7.2 Manual QA: full vault lifecycle (create → save credential → export backup → restore on new device → verify credential accessible)
