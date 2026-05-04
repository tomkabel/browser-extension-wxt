## Why

The entire phone-as-vault security model depends on the vault encryption scheme on Android, yet no spec defines how credentials are encrypted at rest, how the master key is protected by Android Keystore, or how users recover their vault if the phone is lost or destroyed. This is a critical architectural gap — the security properties of the system are formally unverifiable without a concrete encryption design.

## What Changes

Define and document the vault encryption specification: master key in Android Keystore (biometric-gated AES-256-GCM), per-credential encryption keys derived via HKDF-SHA256, SQLite storage schema, seed phrase backup (BIP39 24 words), and disaster recovery flow. Implement the encryption/decryption primitives in the Android companion app (Kotlin or shared TypeScript via Expo). Add unit tests for encryption round-trips, key derivation, and seed phrase restore.

## Capabilities

### New Capabilities
- `vault-encryption`: AES-256-GCM per-credential encryption with HKDF-derived keys and Android Keystore master key
- `vault-storage`: SQLite schema for credential storage with IV, timestamps, and domain-primary-key indexing
- `seed-phrase-backup`: BIP39 24-word seed phrase for vault recovery; encrypted backup to cloud storage
- `disaster-recovery`: Vault restore from seed phrase on new device, with master key regeneration and re-encryption

### Existing Capabilities Modified
- `android-companion`: Add vault encryption module, storage layer, and backup/restore flows
