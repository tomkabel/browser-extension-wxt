## 0. WebUSB Transport (Replaces Go Native Host for Bulk Transfers)

- [x] 0.1 Create `lib/usb/WebUsbTransport.ts`: transport class using shared `webusbCore.ts` with `connect()`, `send()`, `disconnect()`
- [x] 0.2 Implement device enumeration using `ANDROID_VENDOR_IDS` (8 known Android vendors) via shared core
- [x] 0.3 Implement dynamic USB endpoint discovery (bulk IN/OUT) via `findEndpointPair()`
- [x] 0.4 Implement disconnect detection via transfer error with disconnect callback dispatch
- [x] 0.5 Unit test: WebUSB transport API matches `Transport` interface (14 tests)
- [x] 0.6 Integration test: WebUSB + TransportManager failover contract (4 tests)

## 0B. AOA Negotiation Shim (Minimal ~30-line Go host)

- [x] 0B.1 Create minimal Go binary: only handles AOA mode switch via existing `aoa` package
- [ ] 0B.2 Remove existing full Go host code (crypto/, native_messaging/, readloop.go, router.go) — DEFERRED to Phase 3 per migration timeline
- [x] 0B.3 Shim communicates success/failure via simple stdout JSON, then exits
- [x] 0B.4 Extension detects shim success → hands off to WebUSB via `aoaShim.ts`

## 1. Add Go CI Pipeline

- [x] 1.1 Add Go setup step to `.github/workflows/test.yml`: `actions/setup-go@v5` with `go-version-file`
- [x] 1.2 Add `go test ./... -race -count=1` job for `apps/native-host/` (existing tests + shim tests)
- [x] 1.3 Add `go vet ./...` and `staticcheck ./...` to the same job (staticcheck pinned to 2024.1.1)
- [x] 1.4 Verify Go tests pass locally (`go test`, `go vet` — both clean)

## 2. Create Mock Native Host for E2E

- [x] 2.1 Create `e2e/mocks/native-host-server.ts`: Chrome native messaging protocol with buffered read (no data race)
- [x] 2.2 Mock host echoes received messages as `{ echo: true, original: <message> }`
- [x] 2.3 Mock host generates unique host name `org.smartid.mock_host_<pid>_<random_hex>`
- [x] 2.4 Mock host writes its own native messaging manifest to `os.tmpdir()`, cleans up on SIGTERM/SIGINT/exit
- [x] 2.5 Add `e2e/helpers.ts` utility: `startMockHost()` spawns mock, waits for manifest, returns handle with cleanup

## 3. Update `UsbTransport` for Mock Detection

- [x] 3.1 Add `chrome.storage.local` flag `mockNativeHostManifest` for E2E test configuration
- [x] 3.2 `UsbTransport.checkAvailability()` checks WebUSB first, then falls back to mock flag in storage

## 4. Add USB Transport E2E Tests

- [x] 4.1 Create `e2e/transport-manager-failover.spec.ts`: mock host lifecycle, mock flag propagation, disconnect resilience
- [x] 4.2 Add test: USB disconnect simulation does not crash popup
- [x] 4.3 Add test: mock host starts, writes manifest, validates structure
- [ ] 4.4 Run `bun run test:e2e` and verify all new E2E tests pass (requires build + browser)

## 5. Final Verification

- [x] 5.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 5.2 Verify WebUSB transport works alongside WebRTC in offscreen document (requires real device)
- [ ] 5.3 Verify mock host does not interfere with real native host installation (requires E2E run)
