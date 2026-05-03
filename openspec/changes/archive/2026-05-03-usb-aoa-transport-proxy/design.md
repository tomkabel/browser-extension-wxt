## Context

The AOA 2.0 transport is the physical backbone of the V6 architecture. It replaces the WebRTC data channel with a raw USB bulk endpoint connection. The Go Native Messaging Host acts as the bridge between the browser extension (which can only communicate via `chrome.runtime.sendNativeMessage`) and the USB bus (which requires native system calls via `libusb`).

The transport must handle:
- Device discovery and hotplug (USB connect/disconnect events)
- AOA 2.0 protocol negotiation (accessory mode activation)
- ECDH key exchange for session key establishment (Phase 0)
- AES-256-GCM encrypted payload delivery
- Sequence number management for replay protection
- Graceful fallback to WebRTC when USB is unavailable

## Goals / Non-Goals

**Goals:**
- Go Native Messaging Host binary for Windows, macOS, and Linux
- AOA 2.0 protocol implementation: control transfer negotiation → bulk endpoint I/O
- ECDH (Curve25519) key exchange over the AOA control channel
- AES-256-GCM encrypt/decrypt with 96-bit IV and 128-bit authentication tag
- Monotonic sequence number for replay protection (64-bit, persisted in host memory)
- Transport abstraction in the extension: unified interface for WebRTC ↔ USB
- Device hotplug detection and reconnection
- <1ms additional latency over USB bulk transfer

**Non-Goals:**
- zkTLS proof generation (covered by `zktls-context-engine`)
- PIN processing or enclave operations (covered by `ndk-enclave-pin-vault`)
- Network-level TURN/STUN infrastructure (WebRTC fallback uses existing)
- USB audio/video/MTP support — AOA accessory mode only

## Decisions

### 1. Go Native Messaging Host

Go is chosen for the native host because:
- Statically compiles to a single binary with no runtime dependencies
- Cross-compilation for Windows/macOS/Linux is trivial with `GOOS`/`GOARCH`
- libusb bindings via `github.com/google/gousb` are mature
- Native Messaging protocol (stdin/stdout JSON) maps naturally to Go's `encoding/json`

The binary registers via a native messaging manifest JSON file placed in the OS-specific location:
- Windows: `chrome-extension://<id>.json` in the registry
- macOS/Linux: JSON manifest in `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` or `/etc/opt/chrome/native-messaging-hosts/`

### 2. AOA 2.0 Protocol Sequence

```
Host → Device:  libusb_control_transfer(0x40, 51, 0, 0, "manufacturer:SmartIDVault")
Host → Device:  libusb_control_transfer(0x40, 52, 0, 0, "model:TetheredProxy")
Host → Device:  libusb_control_transfer(0x40, 53, 0, 0, "version:6.0")
Host → Device:  libusb_control_transfer(0x40, 54, 0, 0, "URI:https://smartid-vault.local")
Host → Device:  libusb_control_transfer(0x40, 55, 0, 0, "serial:000000001")
Host → Device:  libusb_control_transfer(0x40, 58, 0, 0, "")  // START_ACCESSORY
Device → Host:  [switches to accessory mode, re-enumerates on USB bus]
Host:           libusb_open() on new accessory interface
Host ↔ Device:  Bulk OUT (0x01) / Bulk IN (0x81) — encrypted payloads
```

After `START_ACCESSORY`, the device re-enumerates with a new VID/PID (0x18D1/0x2D01 for Google Accessory). The host must detect this and re-open the device.

### 3. ECDH Key Exchange (Phase 0)

Performed once per USB session (or on first connection):

```
Host:  Generate ephemeral X25519 keypair (host_sk, host_pk)
Host:  Send host_pk (32 bytes) over AOA control channel
Phone: Generate ephemeral X25519 keypair (phone_sk, phone_pk)
Phone: Send phone_pk over AOA control channel
Host:  shared = X25519(host_sk, phone_pk)
Phone: shared = X25519(phone_sk, host_pk)
Both:  session_key = HKDF-SHA256(shared, "smartid-vault-aoa-key-v1", 32)
Both:  Initial sequence_number = 0
```

The session key is held in memory only. It is not persisted to disk. On host restart, a new key exchange occurs.

### 4. AES-256-GCM Payload Format

```
┌─────────────────────────────────────────────────┐
│ Sequence Number (8 bytes, big-endian)           │
├─────────────────────────────────────────────────┤
│ Ciphertext (variable, up to 64KB)               │
├─────────────────────────────────────────────────┤
│ Authentication Tag (16 bytes)                   │
└─────────────────────────────────────────────────┘
```

The sequence number increments monotonically per direction (host→device and device→host have independent counters). Receiving a sequence number that is not exactly `expected + 1` triggers a session rekey.

### 5. Transport Abstraction

The extension defines a `Transport` interface:

```typescript
interface Transport {
  type: 'usb' | 'webrtc'
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(payload: Uint8Array): Promise<void>
  onMessage(callback: (data: Uint8Array) => void): void
  onDisconnect(callback: () => void): void
  getLatency(): Promise<number>
  isAvailable(): boolean
}
```

Both the USB (Native Messaging) and WebRTC transports implement this interface. The `TransportManager` selects the best available transport based on device presence and quality metrics.

## Risks / Trade-offs

- [Risk] USB driver availability on macOS (libusb requires system extension approval) — Bundle a signed system extension or use IOKit directly
- [Risk] Windows driver signing requirements for libusb (WinUSB) — Use signed WinUSB driver or Zadig for development
- [Risk] AOA 2.0 re-enumeration can take 1-3 seconds — Show "Connecting via USB..." in the popup during this window
- [Risk] USB cable disconnect during active session — Detect via bulk write error, transparently fall back to WebRTC, re-establish ECDH on reconnect
- [Risk] Multiple Android devices tethered — Use serial number matching from Phase 0 provisioning to select the correct device
- [Trade-off] Go binary size (~5-10MB statically compiled) vs. C alternative (~500KB) — Go's stdlib and cross-compilation advantages outweigh binary size concerns
