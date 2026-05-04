## ADDED Requirements

### Requirement: forget-device-action
The popup device list SHALL have a "Forget Device" action (or swipe-to-delete). Confirming SHALL trigger signed revocation.

### Requirement: signed-revocation-message
When revoking a device, the extension SHALL:
1. Generate a new Noise static keypair
2. Broadcast `{ type: "revoke", deviceId, signature: sign(oldSK, "revoke:" + deviceId) }` to the signaling server
3. Replace `noiseKeyPair` in storage with the new keypair
4. Remove the device from the device registry

### Requirement: signaling-server-revocation-blacklist
The signaling server SHALL maintain a set of revoked deviceIds (in-memory, TTL: 24 hours). Connections from revoked devices SHALL be rejected.

### Requirement: phone-revocation-handling
- **WHEN** the companion app receives a revocation signal (or fails to connect because its deviceId is blacklisted)
- **THEN** the app SHALL generate a new Noise static keypair and enter unpaired state

#### Scenario: forget-lost-phone
- **WHEN** the user taps "Forget Device" on a phone that was lost
- **THEN** the extension SHALL rotate its keypair and the lost phone SHALL NOT be able to establish future sessions

#### Scenario: revoked-device-reconnection-rejected
- **WHEN** a revoked device attempts to reconnect with its old deviceId
- **THEN** the signaling server SHALL reject the connection
