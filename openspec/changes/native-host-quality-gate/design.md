## Context

The Go native messaging host is the original mechanism for USB AOA 2.0 communication with the Android vault. It works, but introduces:
- A 400+ line Go binary with libusb FFI (compile-time dependency on libusb headers)
- Cross-compilation targets: `linux/amd64`, `linux/arm64`, `windows/amd64`
- `.goreleaser.yml` pipeline for release builds
- Native host manifest registration per OS (Chrome extension permissions)
- No auto-update — users must reinstall the host for every extension update
- Chrome Native Messaging API surface — potential security boundary issues

**The replacement: WebUSB in the offscreen document.**

Chrome's offscreen document (used for WebRTC) has access to `navigator.usb` — the WebUSB API. This API supports:
- Device enumeration with vendor/product ID filters
- Claiming USB interfaces
- Bulk OUT transfers (host→device)
- Bulk IN transfers (device→host)
- Device disconnect events

WebUSB auto-updates with the extension, requires NO separate installation, and works across all Chrome platforms without native dependencies. The only gap: WebUSB cannot perform the initial AOA 2.0 mode negotiation (which requires sending `libusb_control_transfer` with vendor-specific requests). For this, a minimal Go shim (~30 lines) is preserved.

### Comparison

| Aspect | Go Native Host | WebUSB (Replace) |
|---|---|---|
| Lines of code | 400+ Go | ~150 TS |
| Install steps | 3 (download, manifest, permissions) | 0 (included in extension) |
| Auto-update | No | Yes (via CWS) |
| Cross-platform | 3 Go targets | Chrome WebUSB (all) |
| Dependencies | libusb, Go toolchain, goreleaser | None (browser API) |
| Security surface | Native Messaging API | WebUSB API (sandboxed) |
| AOA negotiation | Yes (libusb_control_transfer) | No (needs 30-line Go shim) |
| Bulk transfers | Yes | Yes |

## Goals / Non-Goals

**Goals:**
- Replace Go native host with WebUSB in offscreen document for all AOA bulk communication
- Keep minimal ~30-line Go shim for AOA mode negotiation only
- Add Go CI pipeline (test, vet, staticcheck) for the remaining shim
- Create Node.js mock native host for E2E testing (testing both shim and post-shim WebUSB path)
- Add E2E tests for USB connect/send/receive and TransportManager failover

**Non-Goals:**
- Remove all Go code (AOA negotiation shim remains)
- Support WebUSB on Firefox/Safari (offscreen document is Chrome-only)
- Replace WebRTC transport (WebUSB is an alternative, not replacement)
- Write a Rust WASM USB stack (overkill for AOA bulk transfers)

## Decisions

### Decision 1: WebUSB Bulk Transfer Implementation

```typescript
// In entrypoints/offscreen-webrtc/webusb.ts
export class WebUsbTransport {
  private device: USBDevice | null = null;
  private readonly VENDOR_ID = 0x18D1; // Google/Android in AOA mode

  async connect(): Promise<void> {
    this.device = await navigator.usb.requestDevice({
      filters: [{ vendorId: this.VENDOR_ID }],
    });
    await this.device.open();
    await this.device.selectConfiguration(1);
    await this.device.claimInterface(0);
  }

  async send(data: Uint8Array): Promise<void> {
    await this.device!.transferOut(0x01, data); // Bulk OUT endpoint
  }

  async receive(): Promise<Uint8Array> {
    const result = await this.device!.transferIn(0x81, 16384); // Bulk IN endpoint
    return new Uint8Array(result.data!.buffer);
  }
}
```

### Decision 2: AOA Negotiation Shim (Minimal Go)

The shim is a standalone Go binary that performs only the AOA mode negotiation:

```go
func negotiateAoa(vendorId, productId uint16) error {
  ctx, _ := libusb.NewContext()
  defer ctx.Close()
  dev, _ := ctx.OpenDeviceWithVidPid(vendorId, productId)
  defer dev.Close()
  // Send AOA 2.0 accessory start request
  dev.Control(0x40, 0x34, 0, 0, nil)       // ACCESSORY_START
  dev.Control(0x40, 0x35, 0, 0, nil)       // ACCESSORY_START_AUDIO (if needed)
  // After this, device re-enumerates in AOA mode → WebUSB takes over
}
```

Total: ~30 lines. No crypto, no session management, no bulk transfer.

### Decision 3: E2E Test Strategy

Two test paths:
1. **WebUSB E2E**: Requires a real Android device in AOA mode (or a WebUSB-compatible emulator). Tests: connect → send → receive → disconnect.
2. **Go Shim E2E**: Uses Node.js mock native host. Tests: shim negotiation → WebUSB handoff timing → fallback if shim unavailable.

### Decision 4: Migration Timeline

1. **Phase 1 (now)**: Add Go CI + Node.js mock. Keep Go host as primary.
2. **Phase 2 (2 weeks)**: Implement WebUSB transport in offscreen document. Test alongside Go host.
3. **Phase 3 (1 month)**: Make WebUSB the primary transport. Go host becomes AOA negotiation shim only.
4. **Phase 4 (3 months)**: Remove Go host entirely when Chrome WebUSB supports AOA negotiation (tracking Chrome bug).

## Risks / Trade-offs

- [Risk] WebUSB may not support all AOA 2.0 control requests — Bulk transfers work. The initial AOA negotiation requires `libusb_control_transfer` which WebUSB does not expose. Mitigation: keep the 30-line Go shim for negotiation.
- [Risk] WebUSB `requestDevice()` requires user gesture — Called from the offscreen document during pairing, triggered by user scanning a QR code (user gesture chain preserved).
- [Risk] Linux udev rules — WebUSB on Linux requires `udev` rules to allow access to the USB device. Mitigation: document the single `udev` rule in installation instructions; the Go shim also requires this.
- [Risk] Mock native host doesn't test real USB — Acceptable: the mock tests the TransportManager logic and failover paths. Real USB is tested manually during QA and via WebUSB E2E tests.
