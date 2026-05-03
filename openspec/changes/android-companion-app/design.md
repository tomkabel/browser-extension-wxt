## Context

The Android phone is the secure vault and verification endpoint in the SmartID2 architecture. ARCHITECTURE.md phases 1-4 all require Android-side capabilities:

- **Phase 1 (Pragmatic Pairing):** 3-emoji SAS display + Match/No Match confirmation (replacing numeric-only)
- **Phase 2 (Resilient Transport):** TURN-capable WebRTC with ICE waterfall fallback
- **Phase 3 (Dumb Terminal):** PRF credential storage + IK reconnection with PRF-derived keys
- **Phase 4 (JIT Auth):** Context-aware biometric prompt, credential vault, micro-payload delivery

The initial version (scaffolding) is complete: WebRTC client, Noise XX/IK, FCM wake, a11y relay, basic SAS display, QR scanner. This reactivation adds the capabilities needed to fully realize the ARCHITECTURE.md vision.

## Goals / Non-Goals

**Goals:**
- Emoji SAS derivation (SHA-256 of session key → 3 emoji) and display with Match/No Match
- Accessibility fallback to 6-digit numeric SAS for screen reader users
- Context-aware credential approval: auto-approve when unlocked, notify when locked
- Smartwatch approval via Android Wear notifications
- Phase 1 credential vault: AES-256-GCM encrypted database for website passwords, Keystore-backed key
- **V6 Smart-ID PIN vault: AndroidKeyStore storage using `KeyGenParameterSpec` with `setUserAuthenticationRequired(true)` and `setUnlockedDeviceRequired(true)` per SMARTID_VAULT_v6.md §2.4**
- PRF credential ID storage and IK reconnection with PRF-derived keys
- Handle `credential-request` command type (Phase 1 website passwords) and `pin-authorization` (V6 Smart-ID PIN release)
- TURN-capable ICE configuration with ephemeral credential fetch from signaling server

**Non-Goals:**
- Credential management UI (vault is managed by the phone, no extension UI)
- Password generation (user creates passwords on phone)
- Persistent foreground service (FCM wake + 60s transient remains the pattern)

## Decisions

### 1. Emoji SAS Derivation (same algorithm as extension)

Both sides compute `SHA-256(transport_state.encryption_key)` after Noise XX handshake. First 18 bits → 3 × 6-bit indices → index into fixed 64-emoji palette. No cross-wire transmission of the SAS.

### 2. Phase 1 Credential Vault — AES-256-GCM with Android Keystore

The Phase 1 credential database for website passwords uses AES-256-GCM encryption with a key stored in Android Keystore (hardware-backed on supported devices). The key never leaves the TEE/StrongBox. On `credential-request`, the app decrypts only the matching entry and returns it over the Noise channel.

### 3. V6 Smart-ID PIN Vault — AndroidKeyStore with Biometric Gate

Per SMARTID_VAULT_v6.md §2.4, Smart-ID PINs are stored and managed differently from website passwords:

```kotlin
// Phase 0 provisioning — V6 §2 step 4
val keyGenSpec = KeyGenParameterSpec.Builder("smartid_pin1", PURPOSE_ENCRYPT | PURPOSE_DECRYPT)
  .setBlockModes(BLOCK_MODE_GCM)
  .setEncryptionPaddings(ENCRYPTION_PADDING_NONE)
  .setUserAuthenticationRequired(true)          // biometric each time
  .setUnlockedDeviceRequired(true)               // device must be unlocked
  .setKeyValidityStart(...)
  .setKeyValidityForOriginsEnd(...)
  .build()

val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
keyGenerator.init(keyGenSpec)
keyGenerator.generateKey()

// Encrypt PIN (during provisioning)
val cipher = Cipher.getInstance("AES/GCM/NoPadding")
cipher.init(Cipher.ENCRYPT_MODE, keystoreKey)
val pinCiphertext = cipher.doFinal(pinBytes.toByteArray())
// Store ciphertext + IV locally (plaintext buffer zeroed immediately)
```

| Property | Phase 1 Website Vault | V6 Smart-ID PIN Vault |
|---|---|---|
| Encryption | AES-256-GCM DB | AndroidKeyStore `KeyGenParameterSpec` |
| Hardware binding | Optional (Keystore-backed key) | Mandatory (TEE/StrongBox via `setIsStrongBoxBacked(true)`) |
| Biometric gate | No | Yes — `setUserAuthenticationRequired(true)` |
| Unlock requirement | No | Yes — `setUnlockedDeviceRequired(true)` |
| Data returned | username + password over Noise channel | Never transmitted — decrypted into NDK C++ `mlock` buffer |
| Consumer | Content script DOM injection | NDK enclave PIN→coordinate mapper |
| V6 status | Phase 1, will be deprecated | Core V6 capability |

### 4. Auto-Approve Detection

The app checks `KeyguardManager.isDeviceLocked()` and `PowerManager.isInteractive()` to determine if the phone is unlocked and in-hand. If both indicate unlocked+interactive, auto-approve. Otherwise, post a high-priority notification.

### 5. PRF Credential Storage

The PRF credential ID (opaque byte array, received from the extension during pairing) is stored in EncryptedSharedPreferences. During IK reconnection, the phone uses the stored PRF ID to identify the paired extension and accepts the handshake.

## Risks / Trade-offs

- [Risk] Emoji rendering varies across Android versions → Use only Unicode 11.0 emoji (supported since Android 9+)
- [Risk] Android Keystore hardware attestation may fail on some devices → Fall back to software-backed key with user warning
- [Risk] `isDeviceLocked()` may return false immediately after unlock race → Add 500ms debounce before auto-approve
- [Risk] FCM delivery is unreliable in China → Document that the app requires Google Play Services
- [Risk] V6 Smart-ID PIN vault and Phase 1 website vault coexist with different security profiles → Clear code separation: `SmartIdPinVault` and `VaultManager` are separate classes with separate Keystore key aliases; no data path crosses between them
- [Risk] `setUserAuthenticationRequired(true)` may cause PIN decryption failures if biometric hardware is unavailable → Graceful fallback: detect biometric enrollment during Phase 0 provisioning; abort provisioning if no biometric is configured
- [Risk] User changes or removes biometric after PIN provisioning → The `KeyGenParameterSpec` invalidation causes decryption to fail; the app must detect this and re-prompt for PIN re-entry (new Phase 0 provisioning cycle)
