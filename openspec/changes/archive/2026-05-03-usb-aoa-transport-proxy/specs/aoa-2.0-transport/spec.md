## ADDED Requirements

### Requirement: AOA 2.0 accessory mode negotiation

The Go native host SHALL implement the Android Open Accessory 2.0 protocol state machine to switch the tethered Android device into accessory mode and establish bulk endpoint communication.

#### Scenario: Send accessory identification strings

- **WHEN** the native host discovers a compatible Android device via libusb
- **THEN** it SHALL send control transfers in sequence:
  - `0x40, 51` with `"manufacturer:SmartIDVault"`
  - `0x40, 52` with `"model:TetheredProxy"`
  - `0x40, 53` with `"version:6.0"`
  - `0x40, 54` with `"URI:https://smartid-vault.local"`
  - `0x40, 55` with `"serial:<device-serial>"`
- **AND** each control transfer SHALL be verified for success before proceeding to the next

#### Scenario: Start accessory mode

- **WHEN** all identification strings are sent successfully
- **THEN** the host SHALL send `0x40, 58` with an empty data payload to trigger `START_ACCESSORY`
- **AND** the host SHALL wait for the device to re-enumerate on the USB bus

#### Scenario: Detect re-enumerated accessory device

- **WHEN** the device re-enumerates with VID `0x18D1` / PID `0x2D01` (Google Accessory)
- **THEN** the host SHALL detect the new device via libusb hotplug or polling
- **AND** open the device and claim the accessory interface
- **AND** identify bulk OUT endpoint `0x01` and bulk IN endpoint `0x81`

#### Scenario: Handle negotiation failure

- **WHEN** any control transfer fails (non-zero status or timeout)
- **THEN** the host SHALL close the USB device handle
- **AND** report the failure to the extension via the error response protocol
- **AND** retry the full negotiation sequence up to 3 times with 500ms backoff before giving up

### Requirement: USB device discovery and VID/PID matching

The native host SHALL scan the USB bus for Android devices and match against known VID/PID pairs.

#### Scenario: Scan USB bus for Android devices

- **WHEN** the native host starts
- **THEN** it SHALL enumerate all USB devices via libusb `get_device_list()`
- **AND** filter devices whose VID/PID matches known Android accessory-compatible pairs
- **AND** if multiple matching devices are found, select the one with a serial number matching the provisioned value

#### Scenario: Known VID/PID pairs

- **WHEN** filtering USB devices
- **THEN** the host SHALL match at minimum:
  - Google: `0x18D1` with any PID (accessory mode re-enumeration)
  - Samsung: `0x04E8`
  - OnePlus: `0x2A70`
  - Generic AOA: any device reporting accessory protocol support in its USB descriptors

#### Scenario: Handle hotplug events

- **WHEN** a compatible USB device is connected or disconnected
- **THEN** the host SHALL notify the browser extension via the native messaging protocol
- **AND** on disconnect, clean up the USB session state and encryption keys
- **AND** on connect, initiate device discovery and accessory mode negotiation

### Requirement: Bulk endpoint I/O

The native host SHALL read and write raw payloads over the USB bulk endpoints after accessory mode is established.

#### Scenario: Write payload to device

- **WHEN** the extension sends a message via `chrome.runtime.sendNativeMessage`
- **THEN** the host SHALL encrypt the payload (via session encryption layer)
- **AND** write the encrypted payload to bulk OUT endpoint `0x01` via libusb bulk transfer
- **AND** return success/error to the extension via the native messaging response

#### Scenario: Read payload from device

- **WHEN** the device sends data on bulk IN endpoint `0x81`
- **THEN** the host SHALL read the encrypted payload via libusb bulk transfer (non-blocking poll)
- **AND** decrypt the payload (via session encryption layer)
- **AND** forward the decrypted payload to the extension via the native messaging protocol

#### Scenario: Handle bulk transfer timeout

- **WHEN** a bulk transfer (read or write) times out after 5 seconds
- **THEN** the host SHALL report a timeout error to the extension
- **AND** mark the connection as degraded (triggering fallback evaluation)

### Requirement: Connection lifecycle management

The native host SHALL manage the full USB connection lifecycle from discovery through teardown.

#### Scenario: Connection established

- **WHEN** accessory mode negotiation and key exchange complete successfully
- **THEN** the host SHALL send a `'usb-connected'` status message to the extension
- **AND** begin reading from the bulk IN endpoint in a continuous poll loop

#### Scenario: Connection teardown

- **WHEN** the USB device is disconnected or an unrecoverable error occurs
- **THEN** the host SHALL close the USB device handle
- **AND** zero the session encryption key from memory
- **AND** send a `'usb-disconnected'` status message to the extension
- **AND** return to device discovery mode
