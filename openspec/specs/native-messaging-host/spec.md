## ADDED Requirements

### Requirement: Native messaging host binary

The Go native host binary SHALL register as a Chrome Native Messaging host and bridge `chrome.runtime.sendNativeMessage` calls to USB bulk endpoint I/O.

#### Scenario: Binary registration via manifest

- **WHEN** the native host is installed
- **THEN** a native messaging manifest JSON SHALL be placed at the OS-appropriate location:
  - Windows: Registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\<name>`
  - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/<name>.json`
  - Linux: `~/.config/google-chrome/NativeMessagingHosts/<name>.json`
- **AND** the manifest SHALL specify the extension's allowed origin (`chrome-extension://<id>/`)
- **AND** the manifest SHALL point to the absolute path of the compiled Go binary

### Requirement: Standard I/O JSON message protocol

The native host SHALL communicate with the extension via the Chrome Native Messaging protocol: 4-byte length prefix (native uint32, little-endian on Windows, host-endian on POSIX) followed by JSON message body on stdin/stdout.

#### Scenario: Receive message from extension

- **WHEN** the extension calls `chrome.runtime.sendNativeMessage(name, message)`
- **THEN** the host SHALL read a 4-byte length prefix from stdin
- **AND** read `length` bytes of JSON from stdin
- **AND** deserialize the JSON into the internal message structure
- **AND** route the message to the appropriate handler

#### Scenario: Send message to extension

- **WHEN** the host needs to send data to the extension (device event, received payload, error)
- **THEN** the host SHALL serialize the response as JSON
- **AND** write a 4-byte length prefix to stdout (platform-native endianness)
- **AND** write the JSON bytes to stdout
- **AND** flush stdout immediately

#### Scenario: Handle malformed input

- **WHEN** the host receives a message that fails JSON parsing
- **THEN** it SHALL send an error response with `{ "type": "error", "error": "malformed message" }`
- **AND** continue reading the next message (do not terminate)

### Requirement: Message routing and dispatch

The native host SHALL route incoming messages from the extension to the correct internal handler based on message type.

#### Scenario: Route connect message

- **WHEN** the host receives a `{ "type": "connect" }` message from the extension
- **THEN** it SHALL initiate USB device discovery and AOA accessory mode negotiation
- **AND** respond with `{ "type": "connect-result", "success": true/false }`

#### Scenario: Route send-payload message

- **WHEN** the host receives a `{ "type": "send-payload", "data": "<base64>" }` message
- **THEN** it SHALL decode the base64 payload
- **AND** pass it to the session encryption layer for encryption
- **AND** write the encrypted result to the USB bulk OUT endpoint
- **AND** respond with `{ "type": "send-result", "success": true/false, "sequence": <n> }`

#### Scenario: Route disconnect message

- **WHEN** the host receives a `{ "type": "disconnect" }` message
- **THEN** it SHALL close the USB device handle
- **AND** zero the session encryption key
- **AND** respond with `{ "type": "disconnect-result", "success": true }`

#### Scenario: Route get-status message

- **WHEN** the host receives a `{ "type": "get-status" }` message
- **THEN** it SHALL respond with `{ "type": "status", "connected": true/false, "transport": "usb", "latencyMs": <n> }`

### Requirement: Continuous read loop for device-originated messages

The native host SHALL continuously poll the USB bulk IN endpoint and forward received messages to the extension.

#### Scenario: Device sends data

- **WHEN** an encrypted payload is read from the USB bulk IN endpoint
- **THEN** the host SHALL decrypt it via the session encryption layer
- **AND** send the decrypted payload to the extension as `{ "type": "payload-received", "data": "<base64>" }`
- **AND** continue polling

#### Scenario: Read loop error

- **WHEN** the bulk IN read returns a non-recoverable error (device disconnected)
- **THEN** the host SHALL send `{ "type": "usb-disconnected" }` to the extension
- **AND** exit the read loop and return to discovery mode

### Requirement: Build and cross-compilation

The native host SHALL compile to a single static binary for all target platforms.

#### Scenario: Cross-compilation targets

- **WHEN** building the native host
- **THEN** the build system SHALL produce binaries for:
  - `linux/amd64`, `linux/arm64`
  - `darwin/amd64`, `darwin/arm64`
  - `windows/amd64`
- **AND** each binary SHALL be statically linked (CGO disabled where possible, or `libusb` statically linked)
- **AND** the build SHALL be reproducible (produce identical binaries for the same commit)
