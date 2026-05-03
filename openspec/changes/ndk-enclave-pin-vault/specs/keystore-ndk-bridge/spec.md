## ADDED Requirements

### Requirement: Direct PIN decryption into native memory via JNI + Direct ByteBuffer

The NDK enclave SHALL decrypt PINs from Android Keystore by calling the stable Java `Cipher.doFinal(ByteBuffer, ByteBuffer)` API via JNI, using a direct ByteBuffer allocated in mlock'd native memory as the output target. The decrypted plaintext SHALL NEVER occupy Java heap memory.

#### Scenario: PIN decrypted into mlocked buffer via Direct ByteBuffer

- **GIVEN** the ciphertext was previously stored by `KeyGenParameterSpec` encryption (AES/GCM/NoPadding)
- **AND** an mlock'd native buffer has been allocated via `MlockAllocator::allocate()`
- **AND** a Java direct ByteBuffer wrapping this native buffer has been created via `NewDirectByteBuffer()`
- **WHEN** `decryptPin()` is called with a valid key alias, ciphertext IV, and the direct ByteBuffer
- **THEN** the function SHALL obtain the Android Keystore key via `KeyStore.getKey(alias, null)` called from JNI
- **AND** initialize a `Cipher.getInstance("AES/GCM/NoPadding")` in `DECRYPT_MODE` with the key and GCMParameterSpec
- **AND** call `Cipher.doFinal(ByteBuffer ciphertextInput, ByteBuffer directOutput)` to write plaintext directly into the mlock'd native buffer
- **AND** the decrypted plaintext SHALL NEVER occupy Java heap memory — Conscrypt's BoringSSL backend writes directly to the direct buffer's native address
- **AND** verify the key enrollment includes authentication binding
- **AND** return success status

#### Scenario: Decryption failure with secure cleanup

- **WHEN** `Cipher.doFinal()` throws `AEADBadTagException` (wrong key, tampered ciphertext, biometric not presented)
- **THEN** the function SHALL zero any partial output in the mlocked buffer (BoringSSL may have partially written before tag check)
- **AND** return an error code without throwing an exception through JNI

#### Scenario: No NDK fallback path needed

- **WHEN** the mobile Android version is API 33+
- **THEN** the primary and ONLY path is the JNI-call to `Cipher.doFinal(ByteBuffer, ByteBuffer)` with a direct ByteBuffer output
- **AND** the NDK `AKeyStore` API SHALL NOT be used — it is an unstable internal API not in the NDK stable surface
