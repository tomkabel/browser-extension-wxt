## Context

The Go Native Messaging Host at `apps/native-host/` is a complete implementation with AOA 2.0 transport, Noise handshake, and native messaging protocol, but has no CI integration. The existing `native-messaging.spec.ts` E2E test only verifies the "host not installed" path. There's no way to test USB transport without a physical Android device connected via USB.

## Goals / Non-Goals

**Goals:**
- Add `go test ./... -race -count=1` to CI pipeline
- Add `go vet` and `staticcheck` to CI
- Create a Node.js mock native host for E2E testing
- Add E2E tests covering USB connect, message round-trip, and disconnect fallback
- Verify TransportManager USB→WebRTC auto-failover in E2E

**Non-Goals:**
- Modifying any Go native host source code
- Physical Android device testing in CI
- Windows native host integration in CI (cross-compilation is build-only)

## Decisions

### Decision 1: Node.js mock over Go mock

A Node.js mock native host speaks the same Chrome native messaging protocol (4-byte length prefix + JSON/UTF-8 message body). It's spawned as a child process by the Playwright test, writes its manifest to a temp directory, and the test points the extension at it via `chrome.runtime.connectNative`. Reasoning: the mock needs zero dependencies and matches the Playwright/Node.js test stack.

### Decision 2: Mock host manifest isolation

Each E2E test run generates a unique mock host name (`org.smartid.mock_host_<random>`) and writes a temporary manifest. The test passes the manifest path to the extension via a `chrome.storage.local` flag. The `UsbTransport` reads this flag in `checkAvailability()` to detect the mock host. This avoids conflicting with a real installed native host.

### Decision 3: TransportManager E2E coverage

Add a dedicated `transport-manager-failover.spec.ts` test that starts the mock host, verifies USB transport connects, sends a ping message, verifies response, then kills the mock host and verifies the popup shows WebRTC fallback. The test measures time-to-failover and asserts it completes within 5 seconds.

## Risks / Trade-offs

- [Risk] Mock host doesn't exercise real AOA USB transport — That's intentional. The Go native host's AOA logic and Noise handshake are covered by Go unit tests. The E2E mock tests the extension-side `UsbTransport`, `TransportManager`, and popup integration.
- [Risk] Random mock host name may collide — Namespace with timestamp + PID: `org.smartid.mock_host_<pid>_<timestamp>`.
