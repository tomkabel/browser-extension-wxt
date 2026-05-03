## ADDED Requirements

### Requirement: Silent re-authentication on browser restart

The extension SHALL silently re-establish the WebRTC + Noise session on browser restart using the PRF-derived key and an IK handshake.

#### Scenario: Service worker startup triggers re-auth

- **WHEN** the Chrome service worker starts (browser restart, popup open, or alarm wake)
- **AND** the extension successfully discovers a PRF credential on the platform authenticator via `navigator.credentials.get()` with empty `allowCredentials`
- **THEN** the service worker SHALL silently assert the PRF credential
- **AND** derive the re-authentication key from `prfOutput.first`
- **AND** create an IK Noise handshake using the derived key as the initiator
- **AND** complete the IK handshake over the re-established WebRTC data channel

#### Scenario: Re-auth succeeds transparently

- **WHEN** the IK handshake completes successfully
- **THEN** the extension SHALL update the session state to `active` in `chrome.storage.session`
- **AND** the user SHALL NOT see any authentication prompt or popup
- **AND** the pairing state SHALL remain `paired`

#### Scenario: Re-auth fails, show popup prompt

- **WHEN** the IK handshake fails or the PRF assertion is rejected
- **THEN** the extension SHALL set session state to `none`
- **AND** the popup SHALL display "Reconnect to phone" with a "Re-authenticate" button
- **AND** the user SHALL NOT be left in an error state without a recovery path

### Requirement: IK handshake with PRF-derived key

The extension SHALL use the PRF-derived key as the initiator static key for the Noise IK handshake.

#### Scenario: IK handshake with PRF key

- **WHEN** the re-authentication key is derived from the PRF assertion
- **THEN** the extension SHALL use this key as `localStaticKey` for `createIKHandshake()`
- **AND** use the cached `remoteStaticPublicKey` from the previous pairing
- **AND** complete the 1-round-trip IK handshake
