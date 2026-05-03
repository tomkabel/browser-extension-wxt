## Why

The ARCHITECTURE.md defines Android as the secure vault and verification endpoint — the phone holds encrypted credentials, decides when to auto-approve based on unlock state, displays emoji SAS for pairing, and silently re-authenticates the WebRTC link on browser restart via PRF. The initial Android app scaffolding (WebRTC, Noise, FCM, a11y) is complete, but the following capabilities required by ARCHITECTURE.md are missing:

1. **3-Emoji SAS** (Phase 1) — currently numeric-only; architecture mandates emoji
2. **Context-aware biometric prompt** (Phase 4) — no unlock-state detection or auto-approve
3. **Credential vault + JIT delivery** (Phase 4) — no credential storage or on-demand decryption
4. **PRF silent re-auth** (Phase 3) — no PRF credential storage or IK reconnection with derived keys

**V6 Scope:** For SMARTID_VAULT_v6.md compliance, the credential vault stores Smart-ID PIN1/PIN2 using AndroidKeyStore with `KeyGenParameterSpec` (`setUserAuthenticationRequired(true)`, `setUnlockedDeviceRequired(true)`). This is distinct from the Phase 1 generic website password vault (AES-256-GCM encrypted database). Both vaults coexist on the phone: the V6 PIN vault feeds the NDK enclave; the Phase 1 password vault feeds the DOM auto-fill content script. See `vault6-migration-strategy` for the deprecation path of the Phase 1 vault.

Without these, the extension cannot deliver the "telepathic" UX described in ARCHITECTURE.md.

## What Changes

- **Emoji SAS derivation and display**: Phone derives 3-emoji SAS from Noise session key; shows Match/No Match UI
- **Numeric SAS fallback**: Screen reader detection switches to 6-digit display
- **Context-aware biometric**: Check `isDeviceLocked()` + `isInteractive()`; auto-approve or show notification
- **Smartwatch approval**: Android Wear notification for credential approval from watch
- **Phase 1 credential vault**: AES-256-GCM encrypted database backed by Android Keystore (website passwords for DOM auto-fill)
- **V6 Smart-ID PIN vault**: `KeyGenParameterSpec` with `setUserAuthenticationRequired(true)` and `setUnlockedDeviceRequired(true)` per SMARTID_VAULT_v6.md §2.4 — feeds NDK enclave, not transmitted
- **PRF credential storage**: Store PRF credential ID; accept IK reconnection with PRF-derived key
- **credential-request handler**: New command type alongside existing transaction commands
- **TURN-capable WebRTC**: Fetch ephemeral TURN credentials from signaling server; configure ICE with relay

## Capabilities

### Modified Capabilities

- `android-webrtc-client`: Now supports TURN ICE configuration with ephemeral credentials
- `android-noise-handshake`: IK responder now accepts PRF-derived keys for silent re-auth
- `transaction-display-ui`: Now also handles `credential-request` command type alongside transaction verification

### New Capabilities

- `emoji-sas-display`: Derive and display 3-emoji SAS from Noise session key; Match/No Match confirmation
- `emoji-sas-fallback`: Accessibility fallback to 6-digit numeric SAS
- `context-aware-approval`: Check phone unlock state; auto-approve or post biometric notification; smartwatch support
- `credential-vault`: AES-256-GCM encrypted credential storage with Android Keystore (Phase 1 website passwords)
- `smartid-pin-vault`: AndroidKeyStore PIN storage with `KeyGenParameterSpec` biometric + unlock gating (V6 Smart-ID PINs) — feeds NDK enclave coordinate mapper
- `prf-credential-storage`: Store PRF credential ID from extension; accept IK handshake with PRF-derived key

## Impact

- `EmojiSasDerivation.kt` — SHA-256 → 18-bit → 3 emoji indices → lookup in 64-emoji palette
- `AutoApproveManager.kt` — `isDeviceLocked()` + `isInteractive()` + debounce + smartwatch
- `VaultManager.kt` — AES-256-GCM encrypted database, Android Keystore-backed key, single-entry decryption (Phase 1 website passwords)
- `SmartIdPinVault.kt` — AndroidKeyStore PIN encryption/decryption with `KeyGenParameterSpec` biometric + unlock gating per V6 §2.4
- `CredentialRequestHandler.kt` — Handle `credential-request` command, route to Phase 1 vault
- `PrfCredentialStore.kt` — Store/retrieve PRF credential ID in EncryptedSharedPreferences
- `WebRTCManager.kt` — Fetch TURN credentials from signaling server, configure ICE servers
- `PairingViewModel.kt` — Updated to show emoji SAS with Match/No Match instead of numeric-only
