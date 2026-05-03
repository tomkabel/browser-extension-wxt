## ADDED Requirements

### Requirement: Direct PIN decryption via NDK Keystore API

The NDK enclave SHALL decrypt PINs directly from Android Keystore using the NDK `AKeyStore` API, bypassing the JVM heap.

#### Scenario: PIN decrypted into mlocked buffer

- **GIVEN** the ciphertext was previously stored by `KeyGenParameterSpec` encryption
- **WHEN** `decryptPin()` is called with a valid key alias, ciphertext, and mlocked buffer pointer
- **THEN** the function SHALL open the keystore via `AKeyStore_getKeyStore()`
- **AND** retrieve the encrypted blob via `AKeyStore_getBlob()`
- **AND** decrypt directly into the mlocked buffer (never into a Java `byte[]`)
- **AND** verify `KM_TAG_USER_AUTHENTICATION_REQUIRED` is set on the key
- **AND** return success status

#### Scenario: JNI fallback path

- **WHEN** the NDK `AKeyStore` API is unavailable or returns error
- **THEN** the enclave SHALL call the Java `Cipher` API for decryption
- **AND** immediately copy the plaintext to the C++ mlocked buffer via `GetByteArrayElements()`
- **AND** zero the Java `byte[]` immediately after the JNI transfer

#### Scenario: Decryption failure

- **WHEN** decryption fails (wrong key, invalid ciphertext, biometric not presented)
- **THEN** the function SHALL zero any partial output in the mlocked buffer
- **AND** return an error code without throwing an exception through JNI
