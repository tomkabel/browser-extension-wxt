## ADDED Requirements

### Requirement: WebAuthn assertion with custom challenge

The extension SHALL invoke `navigator.credentials.get()` with the derived SHA-256 challenge, requiring user verification and platform authenticator.

#### Scenario: Assertion invocation

- **GIVEN** the derived challenge from `challenge-derivation`
- **AND** the user has a provisioned passkey for the extension origin
- **WHEN** the extension calls `navigator.credentials.get()` from the popup window
- **THEN** the request SHALL include: `challenge: derivedChallenge`, `rpId: extensionOrigin`, `allowCredentials` with stored credential ID, `userVerification: 'required'`, and `timeout: 60000`
- **AND** the user SHALL see the OS biometric prompt (Windows Hello / TouchID)

#### Scenario: Assertion response extracted

- **WHEN** the user successfully completes biometric verification
- **THEN** the extension SHALL extract: `rawId`, `response.authenticatorData`, `response.signature`, and `response.clientDataJSON`
- **AND** SHALL serialize these for transport to the Android Vault

#### Scenario: Assertion timeout

- **WHEN** biometric verification is not completed within 60 seconds
- **THEN** the extension SHALL reject the assertion request
- **AND** display "Biometric verification timed out" in the popup
- **AND** SHALL NOT transmit any partial data
