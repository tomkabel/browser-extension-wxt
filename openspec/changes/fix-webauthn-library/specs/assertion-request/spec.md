## ADDED Requirements

### Requirement: assertion-request-invocation
The `createAssertionRequest()` function SHALL call `navigator.credentials.get()` with `userVerification: 'required'` and `timeout: 60000`, returning structured assertion data on success.

### Requirement: assertion-timeout
- **WHEN** `navigator.credentials.get()` does not resolve within 60 seconds
- **THEN** `createAssertionRequest()` SHALL return `{ success: false, error: 'Biometric verification timed out', timedOut: true }`

### Requirement: assertion-cancellation
- **WHEN** the user cancels the biometric prompt (credential.get returns null)
- **THEN** `createAssertionRequest()` SHALL return `{ success: false, error: 'Biometric verification cancelled', timedOut: false }`

### Requirement: allow-credential-filtering
- **WHEN** `allowCredentialId` is provided in options
- **THEN** `publicKey.allowCredentials` SHALL be set with the provided credential ID, `type: 'public-key'`, and transports `['internal', 'usb', 'nfc']`

### Requirement: assertion-response-serialization
- **WHEN** assertion succeeds
- **THEN** the response SHALL contain `rawId`, `credentialId` (base64), `authenticatorData`, `signature`, and `clientDataJSON` as `Uint8Array`

#### Scenario: type-error-resolution
- **WHEN** the module is type-checked with `tsc --noEmit`
- **THEN** no `BufferSource`-related type errors SHALL appear
