## ADDED Requirements

**Phase 1 Scope:** This protocol governs approval for the Phase 1 generic website password vault. In V6, the same unlock-state detection logic is retained for authorizing the NDK enclave, but the data flow differs: V6 never transmits credentials over the channel — it authorizes local enclave PIN decryption that outputs anonymous coordinates.

### Requirement: Phone unlock state determines approval mode

The credential request SHALL include the phone's unlock state, which determines whether the request is auto-approved or requires biometric verification.

#### Scenario: Phone unlocked, Phase 1 auto-approve

- **WHEN** the phone is currently unlocked and in the user's hand
- **AND** a Phase 1 `credential-request` arrives
- **THEN** the phone SHALL silently decrypt and return the credentials over the Noise channel
- **AND** the extension popup SHALL show "Credentials filled automatically"

#### Scenario: Phone unlocked, V6 enclave authorization

- **WHEN** the phone is currently unlocked and in the user's hand
- **AND** a V6 `pin-authorization` command arrives (after zkTLS + WebAuthn verification)
- **THEN** the app SHALL authorize the NDK enclave to decrypt the Smart-ID PIN locally
- **AND** the returned data SHALL be `float[x,y][]` coordinates (not credential strings)

#### Scenario: Phone locked, biometric required

- **WHEN** the phone is locked
- **AND** a credential request arrives
- **THEN** the phone SHALL show a lock-screen notification "Tap fingerprint to log into <domain> on Laptop"
- **AND** credentials SHALL NOT be returned until the user authenticates on the phone

#### Scenario: Smartwatch tap (Android Wear)

- **WHEN** the phone is locked
- **AND** a smartwatch is connected via Android Wear
- **THEN** the credential request SHALL trigger a silent tap notification on the smartwatch
- **AND** the user SHALL be able to approve from the watch

### Requirement: Approval state communicated to extension

The phone SHALL communicate its approval mode to the extension in the credential response.

#### Scenario: Phase 1 auto-approved response

- **WHEN** the phone auto-approves a Phase 1 credential request
- **THEN** the response SHALL include `approval_mode: 'auto'`
- **AND** the extension SHALL inject credentials immediately upon receipt (no popup interaction)
- **AND** the popup SHALL show "Credentials filled automatically"

#### Scenario: V6 enclave auto-approved (no credential transmission)

- **WHEN** the phone auto-approves a V6 `pin-authorization` command
- **THEN** the response SHALL include `approval_mode: 'auto'`
- **AND** the enclave SHALL execute PIN→coordinate mapping locally
- **AND** the extension popup SHALL show "Smart-ID PIN authorized"

#### Scenario: Biometric-approved response

- **WHEN** the phone requires and receives biometric approval for a Phase 1 request
- **THEN** the response SHALL include `approval_mode: 'biometric'`
- **AND** the extension SHALL inject credentials upon receiving the post-approval response (no popup interaction)
- **AND** the popup SHALL show "Waiting for phone authentication..." until the response arrives, then "Credentials filled"
