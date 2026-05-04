## ADDED Requirements

### Requirement: device-list-popup-ui
The popup SHALL display a device list panel showing all paired devices. The active device SHALL be highlighted. Each device SHALL show its name and last-seen timestamp.

### Requirement: switch-active-device
The user SHALL be able to select a different paired device from the list. Switching devices SHALL:
1. Deactivate the current transport
2. Initiate an IK Noise handshake with the selected device using its stored `phoneStaticKey`
3. Route all subsequent commands through the new transport

### Requirement: credential-request-routing
Credential requests, transaction verifications, and all other commands SHALL be routed to the currently active device's transport connection.

#### Scenario: switch-between-devices
- **WHEN** the user selects a second paired phone from the device list
- **THEN** the extension SHALL connect to the selected phone and subsequent credential requests SHALL be routed to it

#### Scenario: active-device-persistence
- **WHEN** the browser is restarted and PRF re-auth succeeds
- **THEN** the last active device SHALL be re-selected
