## Why

The extension supports only a single paired phone. Users who have multiple devices (phone + tablet, work phone + personal phone) cannot pair them all. There is no mechanism to revoke a lost phone's pairing. If a phone is stolen, the user cannot prevent it from reconnecting. The current "pairing" is an all-or-nothing state with no device identity.

## What Changes

Add a device registry in `chrome.storage.session` that stores multiple paired phones with device ID (derived from Noise static key fingerprint), user-assigned name, and last-seen timestamp. The popup gains a device list panel showing all paired phones with the active one highlighted, and a "Switch Device" action. Add signed revocation: when the user un-pairs a device, the extension broadcasts a signed revocation to the signaling server, which blacklists the device. On the phone side, the app supports generating a new Noise static keypair when pairing is revoked.

## Capabilities

### New Capabilities
- `device-registry`: Multi-entry storage of paired devices with metadata (name, fingerprint, lastSeen, isPrimary)
- `device-switching`: Popup UI to select active phone from paired devices; credential requests route to selected device
- `signed-revocation`: Extension broadcasts signed revocation to signaling server; server blacklists revoked deviceId
- `key-rotation-on-revoke`: Extension generates new Noise static keypair after revocation; old keypair discarded

### Existing Capabilities Modified
- `pairing-service`: Register device in device registry instead of single pairing state
- `pairing-coordinator`: Route commands to active device's transport connection
- `signaling-server`: Accept and enforce revocation messages
