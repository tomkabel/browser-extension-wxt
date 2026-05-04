## ADDED Requirements

### Requirement: vault-restore-from-seed
The companion app SHALL support restoring the vault from a BIP39 seed phrase: user enters 24 words → `seed = Bip39MnemonicToSeed(phrase)` → `vaultKey = HKDF(...)` → download encrypted backup from cloud → `AES-256-GCM_decrypt(vaultKey, ciphertext, IV)` → restore credentials to SQLite → generate new Android Keystore master key → re-encrypt all credentials with new per-domain keys.

### Requirement: master-key-regeneration-on-restore
On restore, a NEW master key SHALL be generated in Android Keystore. All credentials SHALL be re-encrypted with new per-domain keys derived from the new master key. The old master key (from the lost phone) SHALL be discarded.

### Requirement: no-digital-seed-storage
The seed phrase SHALL NOT be stored in any digital form (not in Keystore, not in SQLite, not in SharedPreferences, not in cloud). The user bears sole responsibility for its safekeeping.

#### Scenario: full-restore-flow
- **WHEN** a user enters the correct 24-word seed phrase on a new device
- **THEN** the vault SHALL be fully restored with all credentials accessible after biometric authentication

#### Scenario: wrong-seed-rejected
- **WHEN** a user enters an incorrect seed phrase (BIP39 checksum fails or decryption fails)
- **THEN** the restore SHALL fail with an error message and SHALL NOT modify existing vault state
