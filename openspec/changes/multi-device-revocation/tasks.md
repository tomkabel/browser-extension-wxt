## 1. Implement Device Registry

- [ ] 1.1 Define `DeviceRecord` interface and `DeviceMeta` (non-sensitive subset for local storage) in `types/index.ts`
- [ ] 1.2 Create `entrypoints/background/deviceRegistry.ts`:
  - `addDevice(record: DeviceRecord): Promise<void>`
  - `removeDevice(deviceId: string): Promise<void>`
  - `getDevice(deviceId: string): DeviceRecord | undefined`
  - `listDevices(): DeviceRecord[]`
  - `setActiveDevice(deviceId: string): Promise<void>`
  - `getActiveDevice(): DeviceRecord | undefined`
- [ ] 1.3 Store device registry in `chrome.storage.session` key `devices`
- [ ] 1.4 Shadow-copy metadata to `chrome.storage.local` key `deviceMetadata` on every registry mutation (add/remove/update)
- [ ] 1.5 Implement `reconcileDeviceRegistry()` on background startup: if session empty, reconstruct from local metadata (without static keys — requires IK re-handshake or re-pairing)
- [ ] 1.6 Enforce 5-device maximum
- [ ] 1.7 Unit test: add, remove, list devices
- [ ] 1.8 Unit test: max 5 devices enforced
- [ ] 1.9 Unit test: reconciler rebuilds session from local storage on simulated browser restart

## 2. Update Pairing Flow for Device Registration

- [ ] 2.1 In `entrypoints/background/pairingCoordinator.ts`: on handshake completion, add the new device to registry via `deviceRegistry.addDevice()`
- [ ] 2.2 Call `deviceRegistry.setActiveDevice()` for the newly paired device
- [ ] 2.3 Device ID: first 16 hex chars of `SHA-256(phoneStaticKey)`
- [ ] 2.4 Unit test: pairing a phone creates a device record

## 3. Implement Device Switching

- [ ] 3.1 Create `DeviceListPanel.tsx` component in popup: list all paired devices, highlight active, radio-button selection
- [ ] 3.2 On device selection:
  - Deactivate current transport
  - Initiate IK Noise handshake with selected device's stored `phoneStaticKey`
  - On success: set as active, route all commands through new transport
- [ ] 3.3 On failure: show error, keep previous active device
- [ ] 3.4 Wire `DeviceListPanel` into popup `App.tsx` routing

## 4. Implement Signed Revocation

- [ ] 4.1 In `deviceRegistry.ts`: add `revokeDevice(deviceId: string): Promise<void>`
  - Generate new Noise keypair
  - Broadcast signed revocation to signaling server
  - Replace `noiseKeyPair` in storage
  - Remove device from registry
  - Zero old private key
- [ ] 4.2 Add "Forget Device" action to `DeviceListPanel` with confirmation dialog
- [ ] 4.3 After revocation: set extension state to "unpaired" (key rotated, all connections invalid)
- [ ] 4.4 Add `revoke` event handler to signaling server: blacklist deviceId (in-memory, 24h TTL)
- [ ] 4.5 Unit test: revocation rotates keypair
- [ ] 4.6 Unit test: revoked deviceId cannot reconnect

## 5. Final Verification

- [ ] 5.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 5.2 Manual QA: pair two devices, switch between them, verify credential requests route correctly
- [ ] 5.3 Manual QA: forget device, verify key rotation and re-pair required
