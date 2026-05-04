## Context

The Android companion app needs a vault encryption scheme but none is defined. The security model ("phone is the vault") requires: (1) credential data encrypted at rest with a key bound to biometric authentication, (2) per-credential encryption keys derived from a master key so compromising one credential doesn't expose others, and (3) a recoverable backup mechanism for phone loss. This design defines the complete cryptographic specification.

## Goals / Non-Goals

**Goals:**
- Master key generated and stored in Android Keystore, never extractable
- Per-credential encryption keys derived via HKDF-SHA256 from master key + domain salt
- Each credential encrypted with AES-256-GCM (authenticated encryption, random IV)
- SQLite storage schema for credentials with domain-primary-key indexing
- BIP39 24-word seed phrase for vault recovery
- Encrypted backup to cloud storage (iCloud/Google Drive)
- Recovery flow: seed phrase → vault key → decrypt backup → re-encrypt with new master key on new device

**Non-Goals:**
- Cloud sync of vault between multiple devices (single-device vault)
- Credential sharing or export
- Password generation or vault management UI

## Decisions

### Decision 1: Android Keystore with biometric gate

```kotlin
val spec = KeyGenParameterSpec.Builder("smartid2_master_key")
    .setKeySize(256)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
    .setUserAuthenticationRequired(true)
    .setUserAuthenticationValidityDurationSeconds(60)
    .setInvalidatedByBiometricEnrollmentChange(true)
    .build()
```
The `setInvalidatedByBiometricEnrollmentChange(true)` ensures that if new biometrics are enrolled, the master key is invalidated and the vault must be restored from seed phrase.

### Decision 2: Hierarchical key derivation

Master key never directly encrypts credentials. Per-domain key:
```
CEK_domain = HKDF-SHA256(
    ikm = master_key.encoded,
    salt = UTF-8(domain),
    info = "smartid2-credential-v1"
)
```
Each credential: `AES-256-GCM(CEK_domain, plaintext, iv = random12)`. The IV is stored alongside the ciphertext. Domain-level key derivation means the phone can derive only the key for the requested domain without exposing other credentials in memory.

### Decision 3: SQLite storage

```sql
CREATE TABLE credentials (
    domain TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    ciphertext BLOB NOT NULL,
    iv BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```
Domain is the primary key (one credential per domain). The `username` is stored in plaintext (it appears in the popup UI for disambiguation). Only the password is encrypted. Rationale: the domain + username pair identifies the credential in the UI; encrypting the username would require decrypting every entry just to display the list.

### Decision 4: BIP39 seed phrase for recovery

```kotlin
// Generate: 256 bits of CSPRNG → BIP39 24 words
val entropy = SecureRandom().generateSeed(32)  // 256 bits
val seedPhrase = Bip39EntropyToMnemonic(entropy)  // 24 words

// Derive vault key: seed → HMAC-SHA512 → first 256 bits
val seed = Bip39MnemonicToSeed(seedPhrase, passphrase = "")
val vaultKey = HKDF-SHA256(ikm = seed, salt = "smartid2-vault-v1", info = "")

// Encrypt vault dump:
// 1. Serialize all credentials to JSON
// 2. AES-256-GCM(vaultKey, json, iv = random12)
// 3. Store ciphertext + iv in cloud storage
```

The seed phrase is displayed ONCE on the phone screen during vault initialization. The user must confirm by re-entering 3 randomly-selected words. The extension never sees, transmits, or stores the seed phrase.

## Risks / Trade-offs

- [Risk] Biometric enrollment change invalidates master key — Intentional. If someone adds a new fingerprint to the user's phone without their knowledge, the vault is locked. Recovery requires seed phrase.
- [Risk] Seed phrase is a single point of failure — Mitigation: the setup flow explicitly warns users to write it down physically. No digital storage.
- [Risk] HKDF-SHA256 per domain has overhead (~1ms per derivation) — Acceptable. Credential requests are infrequent (1 per 30s rate limited).
- [Risk] Username in plaintext leaks site relationships — Partial mitigation: the username is only accessible to someone with phone access. If the phone is lost and unlocked, they've already lost.
