# integration-flow Specification

## Purpose

Define the end-to-end integration scenarios spanning all 4 phases of the ARCHITECTURE.md "Pragmatic Zero-Trust Architecture." Each scenario traces a complete user journey across multiple capabilities, verifying that the independent phase implementations interact correctly as a coherent system.

## Requirements

### Requirement: Full pairing flow (Phase 1 + Phase 2)

The initial device pairing SHALL complete successfully, establishing an E2EE WebRTC data channel with 3-emoji SAS verification and TURN-capable transport.

#### Scenario: User pairs phone with laptop for the first time

- **WHEN** the user opens the extension popup on an unpaired laptop
- **THEN** the extension SHALL generate an ephemeral X25519 keypair and a random Room ID
- **AND** display a QR code encoding `{ publicKey, roomId }`
- **AND** the popup SHALL show a 3-emoji SAS placeholder awaiting confirmation

- **WHEN** the user scans the QR code with the Android companion app
- **THEN** the phone SHALL extract the extension's public key via QR scan
- **AND** connect to the signaling server via Socket.IO using `roomId`
- **AND** derive the Noise XX handshake shared secret via X25519 ECDH
- **AND** the extension SHALL connect to the same signaling room

- **WHEN** both peers are in the signaling room
- **THEN** the signaling server SHALL relay SDP offers/answers and ICE candidates between peers
- **AND** the extension SHALL fetch ephemeral TURN credentials from `GET /turn-credentials`
- **AND** the WebRTC `RTCPeerConnection` SHALL be configured with both STUN and TURN ICE servers
- **AND** the ICE agent SHALL attempt: local mDNS candidates → TURN/UDP → TURN/TCP 443

- **WHEN** the WebRTC data channel opens
- **THEN** the Noise XX handshake SHALL complete over the data channel
- **AND** both sides SHALL independently derive the 3-emoji SAS from `SHA-256(transport_state.encryption_key)`
- **AND** both screens SHALL display the same 3-emoji sequence (e.g., 🚀 🎸 🥑)

- **WHEN** the user taps "Match" on the phone
- **THEN** the phone SHALL send a `sas-confirmed` message over the data channel
- **AND** the extension SHALL finalize pairing
- **AND** the extension SHALL create a WebAuthn PRF discoverable credential (Phase 3 prep)
- **AND** the popup SHALL display "Paired successfully"
- **AND** the phone SHALL cache the extension's static public key in EncryptedSharedPreferences

### Requirement: Silent re-authentication after browser restart (Phase 3)

After a full browser restart, the extension SHALL silently re-establish the WebRTC + Noise session using the WebAuthn PRF discoverable credential, with zero user interaction.

#### Scenario: User reopens browser, extension reconnects silently

- **WHEN** the user restarts Chrome and navigates to any page
- **AND** the extension's service worker starts
- **THEN** the service worker SHALL call `navigator.credentials.get()` with:
  - `mediation: 'silent'`
  - `allowCredentials` omitted (discoverable — authenticator finds the PRF credential)
  - `extensions: { prf: { eval: { first: <salt> } } }`
- **AND** the platform authenticator SHALL discover the credential created during pairing
- **AND** return `prfOutput.first` as the 32-byte re-authentication key

- **WHEN** the re-authentication key is derived
- **THEN** the extension SHALL create a new Offscreen Document with `chrome.offscreen.createDocument()`
- **AND** the Offscreen Document SHALL create a new `RTCPeerConnection`
- **AND** the extension SHALL fetch new TURN credentials from the signaling server
- **AND** the extension SHALL initiate an IK Noise handshake with the phone using the PRF-derived key

- **WHEN** the IK handshake completes
- **THEN** the WebRTC data channel SHALL be re-established
- **AND** the session SHALL be marked `active` in `chrome.storage.session`
- **AND** the user SHALL NOT see any authentication prompt
- **AND** the popup SHALL show "Connected" without any re-auth indication

- **WHEN** the user opens a website that was previously visited
- **THEN** the content script SHALL inject normally without any interruption from the restart

### Requirement: JIT credential delivery (Phase 4 — website passwords)

When the user navigates to a login page, the extension SHALL detect it, request credentials from the phone, and auto-inject them — with zero popup interaction. This is a Phase 1 generic password manager flow. For V6 Smart-ID PIN automation, credentials are never transmitted — the PIN is decrypted locally in the NDK enclave and mapped to anonymous coordinates (see `ndk-enclave-pin-vault` and `ghost-actuator-gesture-injection`).

#### Scenario: User logs into GitHub, phone auto-fills

- **WHEN** the user navigates to `github.com/login`
- **AND** the page finishes loading
- **THEN** the content script SHALL detect `input[type="password"]` and the associated username field
- **AND** emit a `detect-login-form` message to the background

- **WHEN** the background receives the login form detection
- **THEN** it SHALL send a `credential-request` command over the WebRTC data channel (Noise-encrypted)
- **AND** the request payload SHALL include `{ domain: 'github.com', url: 'https://github.com/login', usernameSelector, passwordSelector }`
- **AND** the popup SHALL display "Login detected on github.com — requesting credentials"

- **WHEN** the phone receives the credential request
- **AND** the phone is currently unlocked and in-hand
- **THEN** the phone SHALL auto-approve (no notification required)
- **AND** decrypt the GitHub credentials from the Android Keystore-backed vault
- **AND** send back `{ status: 'found', username: 'user@example.com', password: '<password>', approval_mode: 'auto' }`
- **AND** the response SHALL be Noise-encrypted over the data channel

- **WHEN** the extension receives the credential response with `approval_mode: 'auto'`
- **THEN** the content script SHALL auto-inject the credentials into the detected fields
- **AND** dispatch `input`/`change` events to trigger React/Angular reactivity
- **AND** zero the plaintext buffer via `decryptedBuffer.fill(0)`
- **AND** set password string variable to `''`
- **AND** the popup SHALL display "Credentials filled automatically"

- **WHEN** the user submits the form
- **THEN** the credentials SHALL be sent normally to GitHub
- **AND** no credential data SHALL remain in `chrome.storage.session` or `chrome.storage.local`

#### Scenario: User logs in while phone is locked

- **WHEN** the user navigates to a login page
- **AND** the phone receives the credential request while locked
- **THEN** the phone SHALL respond with `{ status: 'pending', approval_mode: 'biometric' }`
- **AND** post a high-priority notification: "Tap fingerprint to log into <domain> on Laptop"
- **AND** optionally trigger a smartwatch notification via Android Wear

- **WHEN** the extension receives `approval_mode: 'biometric'`
- **THEN** the popup SHALL display "Waiting for phone authentication..."

- **WHEN** the user authenticates on the phone (fingerprint/PIN)
- **THEN** the phone SHALL decrypt and send the micro-payload
- **AND** the extension SHALL auto-inject upon receipt
- **AND** the popup SHALL display "Credentials filled"

#### Scenario: No credentials stored for domain

- **WHEN** the phone receives a credential request for an unknown domain
- **THEN** the phone SHALL respond with `{ status: 'not_found' }`
- **AND** the popup SHALL display "No credentials found for this site"
- **AND** no injection SHALL occur

### Requirement: V6 Smart-ID PIN automation flow (Phase 2 — not Phase 1 password manager)

The V6 Smart-ID authentication flow uses a completely different credential path than the Phase 1 website password manager. No PIN digits are transmitted — the PIN is stored locally in AndroidKeyStore, decrypted in the NDK enclave, and transformed to anonymous coordinates.

#### Scenario: V6 Smart-ID login at whitelisted RP

- **WHEN** the user navigates to `https://www.lhv.ee` and initiates Smart-ID login
- **AND** the control code "4892" appears on the page
- **THEN** the extension SHALL generate a zkTLS proof attesting that the LHV server transmitted "4892"
- **AND** derive `Challenge = SHA256(zkProof || origin || "4892" || session_nonce)` per SMARTID_VAULT_v6.md §3.1
- **AND** invoke `navigator.credentials.get()` with the derived challenge (Windows Hello/TouchID prompt)

- **WHEN** the WebAuthn assertion is obtained
- **THEN** the extension SHALL dispatch `{ zkTLS_proof, webauthn_assertion, origin, code, nonce }` via AOA transport to Android
- **AND** the Java Orchestrator SHALL verify the zkTLS proof, recompute the challenge, and verify the assertion signature

- **WHEN** cryptographic verification passes
- **AND** the request is PIN2 (QES signing)
- **THEN** the eIDAS Hardware Interrupt Gate SHALL arm and wait for physical Volume Down press
- **AND** the SOS haptic pattern SHALL notify the user

- **WHEN** the user presses Volume Down (or for PIN1, auto-approved)
- **THEN** the NDK enclave SHALL decrypt the Smart-ID PIN from AndroidKeyStore into an `mlock`-ed C++ buffer
- **AND** map each decrypted digit to an anonymous `float[x,y]` coordinate
- **AND** `explicit_bzero()` the PIN buffer
- **AND** return the coordinate array to Java

- **WHEN** the Ghost Actuator receives the coordinate array
- **THEN** it SHALL build a `GestureDescription.StrokeDescription` sequence and call `dispatchGesture()`
- **AND** the Smart-ID app SHALL receive simulated human taps at the PIN grid positions
- **AND** the login/signing SHALL complete with zero PIN digits in JVM heap, Binder IPC, or storage

- **THEN** the popup SHALL display "Smart-ID PIN authorized" or "QES signature completed"

#### Scenario: V6 credential vs Phase 1 credential isolation

- **WHEN** the system processes a Phase 1 `credential-request` (website password)
- **AND** simultaneously processes a V6 `pin-authorization` (Smart-ID)
- **THEN** the two flows SHALL use separate Android Keystore key aliases (`credential_vault_key` vs `smartid_pin1`/`smartid_pin2`)
- **AND** the Phase 1 vault SHALL return data over the Noise channel
- **AND** the V6 vault SHALL decrypt into the NDK enclave `mlock` buffer only
- **AND** no code path SHALL cross between the two vaults

### Requirement: Cross-phase dependency — PRF re-auth enables JIT delivery after restart

If the user restarts their browser, the PRF silent re-auth (Phase 3) MUST complete successfully before JIT credential delivery (Phase 4) can function.

#### Scenario: Full cycle — restart → re-auth → login

- **WHEN** the user restarts Chrome
- **AND** the PRF silent re-auth completes (see "Silent re-authentication after browser restart" above)
- **AND** the IK handshake re-establishes the data channel
- **THEN** the extension SHALL be in `paired` + `active` state

- **WHEN** the user navigates to a login page
- **THEN** the credential request SHALL be sent over the re-established data channel
- **AND** the JIT delivery flow SHALL complete as if the browser was never restarted

- **WHEN** PRF re-auth fails (e.g., TPM reset)
- **THEN** the popup SHALL display "Reconnect to phone"
- **AND** credential requests SHALL NOT be sent until the user re-pairs

### Requirement: Transport resilience does not interrupt credential flow (Phase 2)

If the WebRTC connection drops mid-credential-request and reconnects via TURN fallback, the credential request SHALL complete transparently.

#### Scenario: Connection degrades during credential request

- **WHEN** a credential request is in flight
- **AND** the local mDNS connection drops (user moves from home to office Wi-Fi)
- **THEN** the ICE agent SHALL detect the failure within 3 seconds
- **AND** SHALL auto-fallback to TURN/UDP relay
- **AND** the credential request SHALL be retried with exponential backoff (1s, 2s, 4s)

- **WHEN** the TURN relay connection establishes
- **THEN** the credential request SHALL complete transparently
- **AND** the user SHALL NOT see any connection error
- **AND** the credentials SHALL be auto-injected normally

- **WHEN** the connection cannot be re-established within 15 seconds
- **THEN** the credential request SHALL time out
- **AND** the popup SHALL display "Unable to connect to phone"
- **AND** the user SHALL be offered a "Retry" button
