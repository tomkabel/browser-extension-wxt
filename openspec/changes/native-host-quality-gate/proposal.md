## Why

The Go Native Messaging Host at `apps/native-host/` is the USB AOA 2.0 bridge between the extension and Android phone, but has zero test suite integration in CI, no E2E test that exercises actual native messaging, and no mock host for development. The `native-messaging.spec.ts` E2E test only verifies the "host not installed" path. Without quality gates, USB transport regressions will go undetected.

## What Changes

Add a `go test ./... -race` job to the CI pipeline at `.github/workflows/test.yml`. Add `go vet` and `staticcheck` to the CI. Create a Node.js mock native host server for E2E tests that speaks Chrome native messaging protocol over stdin/stdout, installable via a temporary manifest. Add E2E test cases that verify `UsbTransport` connect/send/receive and the `TransportManager` auto-failover from USB to WebRTC on disconnect.

## Capabilities

### New Capabilities
- `native-host-ci`: Go test, vet, and staticcheck jobs in CI pipeline
- `mock-native-host`: Node.js mock that implements Chrome native messaging protocol for E2E testing
- `usb-transport-e2e`: Playwright tests covering USB connect, message round-trip, disconnect fallback

### Existing Capabilities Modified
- `native-host`: No code changes, only test additions
