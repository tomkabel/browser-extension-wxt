## MODIFIED Requirements

### Requirement: WebRTC client

The Android app SHALL implement a WebRTC client using `org.webrtc:google-webrtc` that connects to the signaling server and establishes a data channel.

#### Scenario: Data channel establishment

- **WHEN** the Android app receives an FCM push with action "connect"
- **AND** the transient service starts
- **THEN** the app SHALL connect to the signaling server
- **AND** establish an RTCPeerConnection with DTLS 1.2 data channel

### Requirement: FCM wake-up

The Android app SHALL receive FCM high-priority pushes and start a transient foreground service to handle commands.

#### Scenario: FCM push received

- **WHEN** the extension sends an FCM push to the phone's device token with `{action: "connect"}`
- **THEN** the FCMReceiver SHALL start `TransientCommandService`
- **AND** `TransientCommandService` SHALL stop itself after 60 seconds of inactivity
- **AND** a notification SHALL appear within 5 seconds (Android O+ requirement)

### Requirement: Emoji SAS confirmation

The Android app SHALL display a 3-emoji SAS after completing the Noise XX handshake, with Match/No Match buttons for user confirmation.

#### Scenario: Emoji SAS displayed after handshake

- **WHEN** the Noise XX handshake completes on the phone
- **AND** the phone derives the 3-emoji SAS from `SHA-256(encryption_key)`
- **THEN** the phone SHALL display the 3 emoji prominently with "Do these match your laptop screen?"
- **AND** provide "Yes, Match" and "No, Cancel" buttons
- **AND** only complete pairing after user confirms "Yes, Match"

#### Scenario: Numeric SAS fallback for accessibility

- **WHEN** TalkBack or another screen reader is active
- **THEN** the phone SHALL display the 6-digit numeric SAS instead of emoji
- **AND** provide a "Confirm" button

### Requirement: Context-aware biometric prompt

The Android app SHALL determine the phone's unlock state and choose between silent auto-approval and lock-screen notification for credential requests. This applies to both the Phase 1 website password vault and the V6 Smart-ID PIN vault, but with different data flows.

#### Scenario: Phone unlocked, Phase 1 auto-approve

- **WHEN** a Phase 1 `credential-request` arrives
- **AND** the phone is currently unlocked and in the user's hand
- **THEN** the app SHALL silently decrypt and return the credentials over the Noise channel
- **AND** the response SHALL include `approval_mode: 'auto'`

#### Scenario: Phone unlocked, V6 enclave authorization

- **WHEN** a V6 `pin-authorization` command arrives (after zkTLS + WebAuthn verification)
- **AND** the phone is currently unlocked and in the user's hand
- **THEN** the app SHALL authorize the NDK enclave to decrypt the Smart-ID PIN locally
- **AND** the returned data SHALL be `float[x,y][]` coordinates (not credential strings)

#### Scenario: Phone locked, biometric required

- **WHEN** a credential request arrives (Phase 1 or V6)
- **AND** the phone is locked
- **THEN** the app SHALL show a lock-screen notification "Tap fingerprint to log into <domain> on Laptop"
- **AND** credentials SHALL NOT be returned until the user authenticates

#### Scenario: Smartwatch tap (Android Wear)

- **WHEN** the phone is locked
- **AND** a smartwatch is connected
- **THEN** the credential request SHALL trigger a silent tap notification on the smartwatch
- **AND** the user SHALL be able to approve from the watch

### Requirement: Phase 1 credential vault (website passwords)

The Android app SHALL maintain an encrypted Phase 1 credential vault (AES-256-GCM database, Keystore-backed key) for website password storage. This vault is distinct from the V6 Smart-ID PIN vault and feeds the content script DOM auto-fill flow.

#### Scenario: Phase 1 credential found

- **WHEN** a Phase 1 `credential-request` for domain `example.com` is received
- **AND** credentials exist in the Phase 1 vault for `example.com`
- **THEN** the app SHALL decrypt the credentials locally
- **AND** respond with `{ status: 'found', username, password }` over the Noise channel

#### Scenario: Phase 1 credential not found

- **WHEN** no credentials exist for the requested domain in the Phase 1 vault
- **THEN** the app SHALL respond with `{ status: 'not_found' }`

### Requirement: V6 Smart-ID PIN vault (KeyGenParameterSpec)

The Android app SHALL maintain a separate V6 vault for Smart-ID PIN1/PIN2 using AndroidKeyStore `KeyGenParameterSpec` with `setUserAuthenticationRequired(true)` and `setUnlockedDeviceRequired(true)`, per SMARTID_VAULT_v6.md §2.4. PINs are decrypted directly into the NDK C++ enclave's `mlock`-ed buffer — never returned to the Noise channel.

#### Scenario: V6 PIN storage during provisioning

- **WHEN** the user completes Phase 0 provisioning
- **AND** inputs their Smart-ID PIN1 and PIN2
- **THEN** the app SHALL encrypt each PIN using `KeyGenParameterSpec` with biometric + unlock gating
- **AND** store the ciphertext + IV locally (plaintext buffer zeroed immediately)
- **AND** the keys SHALL be hardware-backed (StrongBox when available)

#### Scenario: V6 PIN decryption for enclave

- **WHEN** a `pin-authorization` command is received (after zkTLS + WebAuthn verification)
- **AND** the C++ enclave requests PIN decryption
- **THEN** the app SHALL decrypt via AndroidKeyStore with biometric re-prompt
- **AND** pass the plaintext directly into the C++ `mlock` buffer via JNI
- **AND** the plaintext SHALL never be stored in a Java/Kotlin variable
- **AND** the returned data SHALL be `float[x,y][]` coordinates, never PIN digits

### Requirement: PRF credential storage for silent re-auth

The Android app SHALL store the PRF credential ID received from the extension during pairing and accept IK reconnection with a PRF-derived key.

#### Scenario: PRF credential ID stored

- **WHEN** pairing completes and the extension creates a WebAuthn PRF credential
- **THEN** the app SHALL receive and store the PRF credential ID in EncryptedSharedPreferences
- **AND** associate it with the paired extension's identity

#### Scenario: IK reconnection with PRF-derived key

- **WHEN** the extension reconnects after browser restart
- **AND** presents a PRF-derived key as the initiator static key for IK handshake
- **THEN** the app SHALL accept the IK handshake using the stored PRF credential ID
- **AND** re-establish the session without user interaction

### Requirement: Accessibility relay

The Android app SHALL relay commands to a11y-bridge via OkHttp HTTP client. If a11y-bridge is unavailable, it SHALL use a direct AccessibilityService fallback.

#### Scenario: a11y-bridge available

- **WHEN** a transaction verification command is received
- **AND** a11y-bridge is available (GET /ping returns 200)
- **THEN** the app SHALL call GET /screen?compact to cross-check the displayed amount

#### Scenario: a11y-bridge unavailable

- **WHEN** a command is received
- **AND** a11y-bridge is not available
- **THEN** the app SHALL use DirectAccessibilityService as fallback
- **AND** guide the user to enable Accessibility Service in Settings if not already enabled
