## ADDED Requirements

### Requirement: usb-transport-connect-e2e
- **WHEN** the mock native host is running and installed
- **THEN** the popup SHALL show USB transport as active within 5 seconds

### Requirement: usb-message-roundtrip-e2e
- **WHEN** a ping message is sent via USB transport
- **THEN** the extension SHALL receive a response within 2 seconds

### Requirement: usb-disconnect-fallback-e2e
- **WHEN** the mock native host process is killed
- **THEN** the popup SHALL transition to WebRTC transport within 10 seconds

### Requirement: transport-manager-failover-spec
A dedicated `e2e/transport-manager-failover.spec.ts` SHALL test: USB connect → send ping → receive pong → kill mock host → verify WebRTC fallback → measure time-to-failover.
