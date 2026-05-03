## Purpose

Define the WebAuthn auth page behavior, supporting both standard user-verification assertions AND PRF-enabled credential creation for silent re-authentication.

## Requirements

### Requirement: Auth page serves as WebAuthn RP

The extension SHALL serve a dedicated auth page at `chrome-extension://<id>/auth.html` that acts as the WebAuthn Relying Party context, supporting both standard user-verification assertions AND PRF-enabled credential creation.

#### Scenario: Credential registration (standard)

- **WHEN** the user opens the auth page for the first time
- **AND** the page calls `navigator.credentials.create()` with `rp: { id: chrome.runtime.id }`
- **THEN** the platform authenticator dialog SHALL appear
- **AND** the credential SHALL be created and stored in the platform authenticator
- **AND** the credential ID SHALL be stored in `chrome.storage.local`

#### Scenario: PRF credential creation during pairing

- **WHEN** the Noise handshake completes and pairing is confirmed
- **AND** the auth page creates a credential with `extensions: { prf: { eval: { first: <salt> } } }`
- **THEN** the platform authenticator SHALL create a PRF-enabled discoverable credential (resident key)
- **AND** the credential ID MAY be cached in `chrome.storage.session` as an optimization for same-session SW wake events — this is NOT required for cross-restart recovery since the authenticator discovers the credential via empty `allowCredentials` on `get()`
- **AND** the PRF output SHALL be returned as part of the credential creation result

#### Scenario: MFA assertion gate

- **WHEN** the user clicks "Authenticate" in the popup
- **AND** the auth page tab opens and calls `navigator.credentials.get()` with `userVerification: 'required'`
- **THEN** the platform authenticator SHALL verify the user (biometric/PIN)
- **AND** the returned assertion SHALL be relayed to the background worker via `chrome.runtime.sendMessage`
- **AND** the tab SHALL call `window.close()` after successful relay
