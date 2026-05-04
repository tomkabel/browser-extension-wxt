## ADDED Requirements

### Requirement: bip39-24-word-seed-generation
The vault setup flow SHALL generate 256 bits of CSPRNG entropy and encode it as a BIP39 24-word mnemonic seed phrase.

### Requirement: vault-key-from-seed
The vault backup encryption key SHALL be derived from the BIP39 seed via: `seed = Bip39MnemonicToSeed(phrase, passphrase="")`, `vaultKey = HKDF-SHA256(ikm=seed, salt="smartid2-vault-v1", info="")`.

### Requirement: encrypted-cloud-backup
The vault SHALL support exporting an encrypted backup: serialize all credentials to JSON, encrypt with `AES-256-GCM(vaultKey, json, random12IV)`, and store the ciphertext+IV in the device's cloud storage (iCloud/Google Drive).

### Requirement: seed-confirmation-during-setup
During vault initialization, the seed phrase SHALL be displayed ONCE on the phone screen. The user SHALL confirm by re-entering 3 randomly-selected words from the phrase. The extension SHALL never see, transmit, or store the seed phrase.

#### Scenario: seed-confirmation
- **WHEN** the user enters the correct 3 words in the correct order
- **THEN** the vault SHALL be initialized and the backup SHALL be created

#### Scenario: wrong-confirmation-rejected
- **WHEN** the user enters 1 or more incorrect words
- **THEN** the setup SHALL reject and SHALL require re-entering 3 different random words
