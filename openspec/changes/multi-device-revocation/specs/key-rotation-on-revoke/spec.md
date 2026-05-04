## ADDED Requirements

### Requirement: key-rotation-on-revocation
When any device is revoked, the extension SHALL generate a new Noise static keypair. The old keypair SHALL be discarded from `chrome.storage.session`.

### Requirement: post-rotation-unpair
After key rotation, the extension's public key no longer matches any phone's stored `extensionStaticKey`. The extension SHALL transition to "unpaired" state and SHALL require re-pairing with all phones.

### Requirement: old-key-invalidation
The old static private key SHALL be zeroed from memory after rotation: `oldPrivateKey.fill(0)` and the `Uint8Array` SHALL be allowed to go out of scope.

#### Scenario: rotation-invalidates-all-sessions
- **WHEN** the extension rotates its Noise keypair
- **THEN** all existing transport connections SHALL be closed and the extension SHALL be in "unpaired" state
