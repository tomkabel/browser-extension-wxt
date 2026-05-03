## ADDED Requirements

### Requirement: Auth page serves as WebAuthn RP

The extension SHALL serve a dedicated auth page at `chrome-extension://<id>/pages/auth.html` that acts as the WebAuthn Relying Party context.

#### Scenario: Credential registration

- **WHEN** the user opens the auth page for the first time
- **AND** the page calls `navigator.credentials.create()` with `rp: { id: chrome.runtime.id }`
- **THEN** the platform authenticator dialog SHALL appear
- **AND** the credential SHALL be created and stored in the platform authenticator
- **AND** the credential ID SHALL be stored in `chrome.storage.local`

#### Scenario: MFA assertion gate

- **WHEN** the user clicks "Authenticate" in the popup
- **AND** the auth page tab opens and calls `navigator.credentials.get()` with `userVerification: 'required'`
- **THEN** the platform authenticator SHALL verify the user (biometric/PIN)
- **AND** the returned assertion SHALL be relayed to the background worker via `chrome.runtime.sendMessage`
- **AND** the tab SHALL call `window.close()` after successful relay

### Requirement: Session state in chrome.storage.session

After successful MFA, the background worker SHALL activate a session in `chrome.storage.session` with a 5-minute TTL enforced by `chrome.alarms`.

#### Scenario: Session activation

- **WHEN** the background worker receives a valid MFA assertion
- **THEN** it SHALL store `{ sessionToken, mfaVerifiedAt }` in `chrome.storage.session`
- **AND** create `chrome.alarms.create('session-ttl', { delayInMinutes: 5 })`
- **AND** all subsequent `sendCommand()` calls SHALL verify the session is active
