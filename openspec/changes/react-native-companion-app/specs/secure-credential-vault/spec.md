## ADDED Requirements

### Requirement: Encrypted credential storage

The app SHALL store LHV credentials and Smart-ID PIN using Android Keystore-backed encryption.

#### Scenario: Store credentials
- **WHEN** the user enters LHV username and password in the vault screen
- **THEN** the app SHALL encrypt them using AES-256-GCM with a key stored in Android Keystore
- **AND** the ciphertext SHALL be stored in app-private shared preferences

#### Scenario: Store Smart-ID PIN
- **WHEN** the user enters their Smart-ID PIN1
- **THEN** the app SHALL generate an Android Keystore key with `setUserAuthenticationRequired(true)`, `setUserAuthenticationValidityDurationSeconds(0)`, and `setUnlockedDeviceRequired(true)`
- **AND** SHALL encrypt the PIN with that key
- **AND** SHALL zero the plaintext PIN buffer immediately after encryption
- **AND** SHALL NOT allow plaintext PIN to remain in any JS variable after encryption completes

### Requirement: Biometric auth timeout

The PIN decryption key SHALL expire immediately after each biometric authentication, requiring re-auth for every operation.

#### Scenario: Auth timeout zero
- **WHEN** the Android Keystore key is generated for Smart-ID PIN storage
- **THEN** `setUserAuthenticationValidityDurationSeconds(0)` SHALL be set
- **AND** after biometric decryption succeeds, a second decryption call 1 second later SHALL fail with `KeyPermanentlyInvalidatedException` unless biometric is re-prompted

#### Scenario: Auth timeout failure (default would be insecure)
- **WHEN** `setUserAuthenticationValidityDurationSeconds` is NOT explicitly set
- **THEN** Android defaults to per-key auth timeout (commonly 30 seconds on API 30+)
- **AND** the app MUST NOT permit this — the PIN vault native module SHALL verify the spec was applied via `KeyGenParameterSpec.Builder` introspection at key generation time

### Requirement: Retrieve credential

The app SHALL decrypt stored credentials only after biometric authentication, with zero plaintext retention.

#### Scenario: Successful credential retrieval
- **WHEN** a `credential-request` handler requires stored LHV credentials
- **THEN** the app SHALL prompt the user for biometric authentication
- **AND** on success, SHALL decrypt the ciphertext and return the plaintext
- **AND** SHALL zero the plaintext buffer within 100ms after the command response is sent

#### Scenario: Biometric failure
- **WHEN** the user fails biometric authentication (wrong fingerprint, face not recognised)
- **THEN** the app SHALL return `{ status: 'error', error: 'biometry_failed' }` to the extension
- **AND** SHALL allow up to 3 retries before returning a hard error
- **AND** after 3 failures, SHALL return `{ status: 'error', error: 'biometry_locked_out' }`

#### Scenario: PIN retrieval with device locked
- **WHEN** the device is locked (screen off before biometric) and a credential request arrives
- **THEN** the app SHALL send a high-priority notification prompting the user to unlock
- **AND** SHALL return `{ status: 'pending', approval_mode: 'biometric' }` to the extension
- **AND** the extension SHALL show "Waiting for phone authentication..." in the popup
