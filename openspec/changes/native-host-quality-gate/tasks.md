## 1. Add Go CI Pipeline

- [ ] 1.1 Add Go setup step to `.github/workflows/test.yml`: `actions/setup-go@v5` with Go 1.22+
- [ ] 1.2 Add `go test ./... -race -count=1` job for `apps/native-host/`
- [ ] 1.3 Add `go vet ./...` and `staticcheck ./...` to the same job
- [ ] 1.4 Verify Go tests pass in CI with a test commit

## 2. Create Mock Native Host for E2E

- [ ] 2.1 Create `e2e/mocks/native-host-server.ts`: Node.js script implementing Chrome native messaging protocol (4-byte length prefix + UTF-8 JSON messages over stdin/stdout)
- [ ] 2.2 Mock host echoes received messages as `{ echo: true, original: <message> }`
- [ ] 2.3 Mock host generates unique host name `org.smartid.mock_host_<pid>_<timestamp>`
- [ ] 2.4 Mock host writes its own native messaging manifest to `os.tmpdir()`
- [ ] 2.5 Add `e2e/helpers.ts` utility: `startMockHost()` spawns mock, returns host manifest path and cleanup function

## 3. Update `UsbTransport` for Mock Detection

- [ ] 3.1 Add `chrome.storage.local` flag `mockNativeHostManifest` for E2E test configuration
- [ ] 3.2 `UsbTransport.checkAvailability()` reads the flag and checks for mock host manifest instead of real host

## 4. Add USB Transport E2E Tests

- [ ] 4.1 Create `e2e/transport-manager-failover.spec.ts`: test USB connect → send ping → receive pong
- [ ] 4.2 Add test: kill mock host → verify WebRTC fallback within 10 seconds
- [ ] 4.3 Add test: popup shows correct transport indicator (USB → WebRTC transition)
- [ ] 4.4 Run `bun run test:e2e` and verify all new tests pass

## 5. Final Verification

- [ ] 5.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 5.2 Verify mock host does not interfere with real native host installation
