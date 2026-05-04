## ADDED Requirements

### Requirement: mock-host-implementation
A Node.js script at `e2e/mocks/native-host-server.ts` SHALL implement the Chrome native messaging protocol (4-byte length-prefixed JSON messages over stdin/stdout).

### Requirement: mock-host-manifest-generation
The mock SHALL write its own native messaging manifest to a temp directory, with a unique host name `org.smartid.mock_host_<pid>_<timestamp>`.

### Requirement: mock-host-echo-protocol
The mock SHALL echo received messages back with a `{ echo: true, original: <message> }` wrapper for round-trip verification.

### Requirement: mock-host-transport-isolation
The mock SHALL NOT interfere with a real installed native host. The `UsbTransport.checkAvailability()` SHALL detect the mock host via a `chrome.storage.local` flag set by the E2E test.

#### Scenario: mock-host-connect-and-echo
- **WHEN** the extension connects to the mock host
- **THEN** sending a message SHALL receive the echo response within 1 second
