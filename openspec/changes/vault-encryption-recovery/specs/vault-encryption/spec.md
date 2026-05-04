## ADDED Requirements

### Requirement: master-key-android-keystore
The Android companion app SHALL generate and store an AES-256-GCM master key in Android Keystore with `setUserAuthenticationRequired(true)`, `setUserAuthenticationValidityDurationSeconds(60)`, and `setInvalidatedByBiometricEnrollmentChange(true)`.

### Requirement: hkdf-per-domain-key-derivation
Each credential encryption key SHALL be derived via `HKDF-SHA256(ikm=masterKey.encoded, salt=UTF-8(domain), info="smartid2-credential-v1")`. The master key SHALL NOT directly encrypt any credential data.

### Requirement: aes-256-gcm-credential-encryption
Each credential password SHALL be encrypted with AES-256-GCM using the per-domain key and a random 12-byte IV. The IV SHALL be stored alongside the ciphertext.

#### Scenario: encrypt-decrypt-roundtrip
- **WHEN** a password is encrypted with a domain key and then decrypted with the same domain key
- **THEN** the plaintext SHALL match the original password

#### Scenario: wrong-domain-key-fails
- **WHEN** a password is encrypted with domain A's key and decrypted with domain B's key
- **THEN** decryption SHALL fail (GCM authentication tag mismatch)

#### Scenario: biometric-enrollment-change-invalidates
- **WHEN** a new biometric is enrolled on the Android device
- **THEN** the master key SHALL be invalidated by the Keystore
