## ADDED Requirements

### Requirement: No cryptographic secrets in chrome.storage.local

The extension SHALL NOT persist any cryptographic key material, keypairs, or derived secrets in `chrome.storage.local`.

#### Scenario: Audit after pairing

- **WHEN** pairing completes
- **THEN** `chrome.storage.local` SHALL NOT contain any private key, symmetric key, or Noise keypair
- **AND** only non-cryptographic metadata (timestamps, device names) may persist in `chrome.storage.local`

#### Scenario: Audit after session activation

- **WHEN** a session is activated (MFA or re-auth)
- **THEN** `chrome.storage.local` SHALL NOT contain any session tokens or cryptographic material
- **AND** session state SHALL exist only in `chrome.storage.session` (RAM)

### Requirement: Fallback auth keys remain in session storage only

When WebAuthn PRF is unavailable and PIN-based ECDSA fallback is used, the decrypted keypair SHALL live only in `chrome.storage.session`.

#### Scenario: PIN-unlocked keypair in session storage

- **WHEN** the user unlocks via PIN using `unlockKeypair()`
- **THEN** the decrypted ECDSA keypair SHALL be stored in `chrome.storage.session`
- **AND** `chrome.storage.local` SHALL contain only the PIN-encrypted keypair (salt, iv, encryptedPk, publicKey)
- **AND** `chrome.storage.local` SHALL NOT contain the raw `CryptoKey` objects

#### Scenario: Session expiry clears keys

- **WHEN** the session TTL expires or the user clears the session
- **THEN** all cryptographic key material in `chrome.storage.session` SHALL be removed
