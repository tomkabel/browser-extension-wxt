## Purpose

Define WebAuthn PRF credential creation and assertion for deriving re-authentication keys from the platform authenticator.

## Requirements

### Requirement: PRF credential creation during pairing

The extension SHALL create a WebAuthn credential with the `prf` extension during initial phone pairing.

#### Scenario: PRF credential created

- **WHEN** the Noise XX handshake completes and pairing is confirmed
- **THEN** the extension SHALL call `navigator.credentials.create()` with `extensions: { prf: { eval: { first: <random_salt> } } }`
- **AND** the platform authenticator SHALL create a discoverable credential
- **AND** the credential SHALL be a discoverable credential (resident key) — no software-side credential ID persistence is required across browser restarts
- **AND** the raw credential ID MAY be cached in `chrome.storage.session` as an optimization for same-session SW wake events (wiped on browser close)

#### Scenario: PRF not supported

- **WHEN** the browser does not support the WebAuthn `prf` extension
- **THEN** the extension SHALL fall back to PIN-based ECDSA keypair (existing `fallbackAuth.ts` behavior)
- **AND** log a development-mode warning: "WebAuthn PRF not available, using PIN fallback"

### Requirement: PRF key derivation on assertion

The extension SHALL derive a re-authentication key from the PRF credential assertion.

#### Scenario: Silent PRF assertion with discoverable credential

- **WHEN** the service worker starts after a browser restart
- **AND** a PRF credential exists on the platform authenticator
- **THEN** the extension SHALL call `navigator.credentials.get()` with `mediation: 'silent'`, `allowCredentials` omitted (empty/discoverable), and `extensions: { prf: { eval: { first: <salt> } } }`
- **AND** the authenticator SHALL discover the PRF credential created during pairing
- **AND** the extension SHALL extract `prfOutput.first` as the 32-byte re-authentication key
- **AND** SHALL NOT rely on any `chrome.storage.session` value to identify the credential (discoverable discovery is authoritative)

#### Scenario: PRF salt derivation

- **WHEN** the PRF credential is created or asserted
- **THEN** the PRF salt SHALL be `SHA-256(phone_static_public_key || "smartid2-reauth-v1")`
- **AND** the same salt SHALL be used for every assertion
