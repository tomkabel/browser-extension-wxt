## ADDED Requirements

### Requirement: device-registry-structure
The extension SHALL maintain a device registry in `chrome.storage.session` as `DeviceRecord[]` with fields: `deviceId`, `name`, `phoneStaticKey`, `publicKey`, `lastSeen`, `pairedAt`, `isPrimary`. Maximum 5 devices.

### Requirement: device-id-derivation
`deviceId` SHALL be derived as the first 16 hex characters of `SHA-256(phoneStaticKey)`.

### Requirement: device-name-assignment
During pairing, the phone SHALL send a device name (user-configurable in Android app). The extension SHALL store it in the device record. The user SHALL be able to rename devices in the popup.

### Requirement: pairing-second-device
- **WHEN** a first phone is already paired and the user initiates pairing
- **THEN** the extension SHALL generate a new QR code and the second phone SHALL complete the handshake as normal
- **WHEN** the second handshake completes
- **THEN** the new phone SHALL be added to the device registry

#### Scenario: pair-two-devices
- **WHEN** two phones are paired sequentially
- **THEN** both SHALL appear in the device registry with distinct deviceIds and names
