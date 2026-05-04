## MODIFIED Requirements

### Requirement: transmit-credential-to-android
- The `pairingCoordinator` module SHALL export `transmitCredentialToAndroid(credentialId: string, publicKeyBytes: Uint8Array): Promise<boolean>`
- It SHALL send the credential ID and raw public key coordinates over the active transport using a new `provision-passkey` command type
- The command SHALL use the existing CommandClient infrastructure (sequence numbering, ACK/retry, encryption)
- **WHEN** transport is unavailable or the command fails after all retries
- **THEN** `transmitCredentialToAndroid` SHALL return `false`
- **WHEN** the phone acknowledges the provisioning
- **THEN** `transmitCredentialToAndroid` SHALL return `true`
