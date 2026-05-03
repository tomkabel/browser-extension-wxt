---
name: android-keystore-keygenparameterspec
description: Android KeyStore KeyGenParameterSpec for the Smart-ID PIN vault. Covers setUserAuthenticationRequired, setUnlockedDeviceRequired, setInvalidatedByBiometricEnrollment, StrongBox vs TEE, biometric gating, key use authorization timeouts, and handling UserNotAuthenticated exceptions.
---

# Android KeyStore — `KeyGenParameterSpec` for PIN Vault

## When to Use

Apply this skill when:
- Implementing the Android companion app's PIN vault (`ndk-enclave` or JVM keystore layer)
- Choosing between StrongBox, TEE, or software-backed keys
- Handling `UserNotAuthenticatedException` during decryption
- Reviewing biometric enrollment invalidation policy

## Overview

SmartID2 stores the user's master vault encryption key (KEK) inside the **Android KeyStore**, protected by hardware. The KEK never leaves the TEE/StrongBox. Individual site passwords are encrypted with this KEK and stored in Room/SQLite.

## KeyGenParameterSpec Builder

```kotlin
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

object VaultKeyGenerator {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "smartid2_vault_kek"

    fun generateOrGetKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

        keyStore.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }

        val keyGen = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )

        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationValidityDurationSeconds(30)
            .setUnlockedDeviceRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .setRandomizedEncryptionRequired(true)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    setIsStrongBoxBacked(true)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    setUserAuthenticationParameters(
                        AuthBiometric.STRONG,
                        KeyProperties.AUTH_BIOMETRIC_STRONG
                    )
                }
            }
            .build()

        keyGen.init(spec)
        return keyGen.generateKey()
    }
}
```

## Security Flags Explained

### `setUserAuthenticationRequired(true)`
- The key **cannot be used** until the user authenticates with biometrics/PIN
- Every cryptographic operation (encrypt/decrypt) triggers `BiometricPrompt` or falls within the validity window
- Without this, malware with `READ_EXTERNAL_STORAGE` could exfiltrate the encrypted DB and brute-force the key in software

### `setUserAuthenticationValidityDurationSeconds(30)`
- After biometric success, the key remains usable for **30 seconds**
- SmartID2 decrypts the vault immediately after auth, then caches plaintext passwords in a **SecureMemory** buffer (native heap, cleared after use)
- Set to `-1` to require auth **per operation** (most secure, worst UX)

### `setUnlockedDeviceRequired(true)`
- Key is unusable if the device is locked
- Prevents cold-boot attacks where an attacker reboots the device into a custom recovery

### `setInvalidatedByBiometricEnrollment(true)`
- If the user adds a new fingerprint, the key is **permanently invalidated**
- Prevents attacker enrollment attacks (attacker adds their fingerprint, unlocks device)
- **Tradeoff**: Users must re-pair with the browser extension after adding fingerprints

### `setIsStrongBoxBacked(true)` (API 28+)
- Stores key in a **dedicated secure element** (StrongBox) instead of TEE
- StrongBox is a separate hardware chip with its own CPU, RAM, and storage
- If StrongBox is unavailable, key generation throws `StrongBoxUnavailableException`
- **Fallback**: catch and retry with TEE

## StrongBox vs TEE Decision Tree

```kotlin
fun generateWithFallback(): SecretKey {
    return try {
        generateKey(useStrongBox = true)
    } catch (e: StrongBoxUnavailableException) {
        // StrongBox not present on this device (e.g., Pixel 3a, many Samsung A-series)
        generateKey(useStrongBox = false)
    } catch (e: InvalidAlgorithmParameterException) {
        // StrongBox present but does not support AES-256-GCM
        generateKey(useStrongBox = false)
    }
}
```

| Feature | TEE | StrongBox |
|---------|-----|-----------|
| Hardware isolation | Shared secure area | Dedicated chip |
| Side-channel resistance | Good | Excellent |
| Availability | ~95% of Android 8+ devices | ~40% (flagships) |
| Performance | Fast | Slower (throttled secure element) |
| Power budget | Normal | Low (battery-constrained) |

## Encryption/Decryption with Biometric Gate

```kotlin
class VaultCipher(private val key: SecretKey) {
    private val cipher = Cipher.getInstance("AES/GCM/NoPadding")

    fun encrypt(plaintext: ByteArray): ByteArray {
        cipher.init(Cipher.ENCRYPT_MODE, key)
        return cipher.doFinal(plaintext)
    }

    fun decrypt(ciphertext: ByteArray): ByteArray {
        // This may throw UserNotAuthenticatedException if outside validity window
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, ciphertext, 0, 12))
        return cipher.doFinal(ciphertext, 12, ciphertext.size - 12)
    }
}
```

## Handling `UserNotAuthenticatedException`

```kotlin
fun decryptWithPrompt(ciphertext: ByteArray, activity: FragmentActivity): Flow<VaultResult> = callbackFlow {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")

    try {
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, ciphertext, 0, 12))
        val plaintext = cipher.doFinal(ciphertext, 12, ciphertext.size - 12)
        trySend(VaultResult.Success(plaintext))
        close()
    } catch (e: UserNotAuthenticatedException) {
        // Show BiometricPrompt
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock SmartID Vault")
            .setSubtitle("Verify your identity")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setConfirmationRequired(false)
            .build()

        val biometricPrompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: AuthenticationResult) {
                    try {
                        result.cryptoObject?.cipher?.let { authCipher ->
                            val plaintext = authCipher.doFinal(ciphertext, 12, ciphertext.size - 12)
                            trySend(VaultResult.Success(plaintext))
                        } ?: trySend(VaultResult.Error("NO_CRYPTO_OBJECT"))
                    } catch (ex: Exception) {
                        trySend(VaultResult.Error(ex.message ?: "DECRYPT_FAILED"))
                    }
                    close()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    trySend(VaultResult.Error("AUTH_ERROR_$errorCode"))
                    close()
                }
            })

        biometricPrompt.authenticate(promptInfo)
    }

    awaitClose()
}
```

## Key Attestation (Optional, V6)

For V6 NDK enclave integration, verify the key was generated inside hardware:

```kotlin
val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
val keyEntry = keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry
val factory = KeyFactory.getInstance(keyEntry.key.algorithm, ANDROID_KEYSTORE)
val keyInfo = factory.getKeySpec(keyEntry.key, KeyInfo::class.java) as KeyInfo

require(keyInfo.isInsideSecureHardware) { "Key not in hardware" }
require(!keyInfo.isUserAuthenticationRequirementEnforcedBySecureHardware) {
    // If false, the TEE delegates auth to the OS, which is weaker
}
```

## Common Pitfalls

1. **Key invalidation surprise**: `setInvalidatedByBiometricEnrollment(true)` means the key is **gone forever** on new fingerprint enrollment. Always keep a **recovery QR code** or cloud backup (encrypted with a separate recovery key).
2. **Secure lock screen bypass**: If the user disables PIN/fingerprint after key creation, subsequent decrypt calls will permanently fail. Detect this and guide the user to re-pair.
3. **Do not store IVs with authentication tags**: GCM requires unique IVs. Use `SecureRandom` and prepend the 12-byte IV to ciphertext.
4. **Thread blocking**: StrongBox operations can take 100-500ms. Never run on the main thread.

## References

- [Android Keystore System](https://developer.android.com/training/articles/keystore)
- `openspec/changes/ndk-enclave-pin-vault/`
- `SMARTID_VAULT_v6.md` — Phase 2 hardware guarantees
