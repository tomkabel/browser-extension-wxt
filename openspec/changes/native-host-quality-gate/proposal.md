## Why

The Go native messaging host (`apps/native-host/`) is a 400+ line Go binary that must be installed separately, depends on libusb, requires cross-compilation for 3 platforms, and cannot auto-update without manual user action. 

This introduces significant technical debt:
- 400+ lines of Go code with libusb FFI
- Native host manifest registration per OS
- `.goreleaser.yml` build pipeline
- No auto-update mechanism
- Chrome Native Messaging security surface

The replacement — **WebUSB in the offscreen document** — eliminates the entire Go codebase. Chrome's offscreen document has access to `navigator.usb` (WebUSB API), which supports bulk transfers over USB AOA. This auto-updates with the extension, requires no separate installation, and works on ChromeOS, Linux, Windows, and macOS.

In parallel, the existing Go host needs CI quality gates (tests, vet, staticcheck) and a Node.js mock for E2E testing until WebUSB is fully deployed.

## What Changes

- **WebUSB transport (new)**: Create `WebUsbTransport` in the offscreen document using `navigator.usb`. Handles device enumeration, bulk IN/OUT transfers, and device disconnect events. Replaces the Go native messaging host for AOA communication.
- **Go AOA negotiation shim (minimal)**: Keep a ~30-line Go shim that only handles the initial `libusb_control_transfer` to switch the Android device into AOA accessory mode. After that, WebUSB takes over.
- **Go CI pipeline** (existing): `go test`, `go vet`, `staticcheck` in GitHub Actions.
- **Node.js mock native host** (existing): For E2E testing before WebUSB is complete.
- **E2E USB transport tests** (existing): Test connect/send/receive and TransportManager failover.

## Capabilities

### New Capabilities

- `webusb-transport`: USB AOA bulk communication via `navigator.usb` in offscreen document — no Go binary, auto-updates with extension
- `aoa-negotiation-shim`: Minimal ~30-line Go binary that only switches device into AOA mode, hands off to WebUSB

### Modified Capabilities

- `native-messaging-host`: Deprecated. Replaced by WebUSB. Go host shrunk from 400+ lines to ~30 lines for AOA negotiation only.
- `usb-transport-e2e`: Tests updated to cover WebUSB path instead of native messaging.

## Impact

- **Browser extension**: New `lib/usb/WebUsbTransport.ts` (~150 lines). Offscreen document imports it and manages USB lifecycle alongside WebRTC.
- **Offscreen document**: `entrypoints/offscreen-webrtc/main.ts` gains USB connect/disconnect/send/receive alongside WebRTC.
- **Go codebase**: `apps/native-host/` shrinks from 400+ lines to ~30 lines (AOA negotiation only). Remove `crypto/`, `native_messaging/`, `readloop.go`, `router.go`.
- **Manifest**: Remove `nativeMessaging` permission. Add `usb` permission.
- **Bundle size**: No change (WebUSB is a browser API, not a library).
- **Platform support**: WebUSB works on ChromeOS, Linux (udev rules), Windows (WinUSB driver), macOS (no extra config). Requires Android device already in AOA mode.

## Dependencies

- WebUSB transport: Requires Chrome 89+ (offscreen document support). WebUSB `navigator.usb` available since Chrome 61.
- AOA negotiation: The ~30-line Go shim must be installed for initial AOA mode switch. After that, WebUSB handles all communication. The shim can be packaged as a smaller, simpler native host.
- E2E tests: The Node.js mock testing path is separate from WebUSB. The mock stays for testing the Go shim path; WebUSB E2E tests use a real USB device or a WebUSB-compatible emulator.
