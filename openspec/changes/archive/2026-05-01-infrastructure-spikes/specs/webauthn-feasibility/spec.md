## ADDED Requirements

### Requirement: WebAuthn create works from chrome-extension:// origin

The extension SHALL be able to call `navigator.credentials.create()` from an extension auth page served at `chrome-extension://<id>/pages/auth.html`.

#### Scenario: Registration with platform authenticator

- **WHEN** the extension opens `chrome-extension://<id>/pages/auth.html` in a browser tab
- **AND** the page calls `navigator.credentials.create()` with `rp: { id: chrome.runtime.id }` and `authenticatorAttachment: 'platform'`
- **THEN** the platform authenticator dialog SHALL appear (Touch ID / Windows Hello / PIN)
- **AND** the credential SHALL be created and returned
- **AND** the credential SHALL persist across extension reloads (RP ID bound to stable extension ID)

### Requirement: WebAuthn get works from chrome-extension:// origin

The extension SHALL be able to call `navigator.credentials.get()` from an extension auth page.

#### Scenario: Assertion with user verification

- **WHEN** the extension opens the auth page in a browser tab
- **AND** calls `navigator.credentials.get()` with `userVerification: 'required'` and a previously registered credential
- **THEN** the platform authenticator dialog SHALL appear
- **AND** the tab SHALL survive the authenticator focus loss (tab not closed)
- **AND** a valid assertion SHALL be returned with the `uv` (User Verified) flag set

### Requirement: Dedicated Tab Survives Focus Loss

The extension auth page tab SHALL survive focus loss when the native OS authenticator dialog appears.

#### Scenario: Tab persistence during authenticator dialog

- **WHEN** the user clicks "Authenticate" in the extension popup
- **AND** the popup opens the auth page via `chrome.tabs.create()`
- **AND** `navigator.credentials.get()` triggers the native OS dialog
- **THEN** the auth tab SHALL NOT close or become destroyed
- **AND** the WebAuthn promise SHALL resolve successfully after the user completes biometric/PIN
