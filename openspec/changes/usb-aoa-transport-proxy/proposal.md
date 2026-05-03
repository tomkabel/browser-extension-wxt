## Why

SMARTID_VAULT_v6.md defines the ultimate end-goal architecture: a tethered Android HSM that communicates with the browser extension over raw USB via Android Open Accessory (AOA) 2.0 protocol. The current WebRTC-based transport (Phase 1) works over wireless networks but exposes surface area: TURN servers, STUN, signaling infrastructure, and potential network-level attacks. AOA 2.0 provides a hardware-bound, air-gap-equivalent transport that eliminates the entire network attack surface and enables the sub-5ms latency required for PIN actuation.

The browser extension cannot communicate with USB devices directly (MV3 service workers lack WebUSB). A Go Native Messaging Host is required to bridge the extension's `chrome.runtime.sendNativeMessage` API to raw `libusb` control transfers. This host is the critical plumbing that enables all V6 security properties.

## What Changes

- **Go Native Messaging Host** (`native_host`): Statically compiled Go binary that registers as a Native Messaging host for the extension. Uses `libusb-1.0` for USB device discovery and AOA 2.0 protocol negotiation.
- **AOA 2.0 Handshake Module**: Implements the Android Open Accessory protocol state machine: control transfer with manufacturer/ model/version strings → accessory start → raw bulk endpoint I/O on `0x01` (OUT) and `0x81` (IN).
- **AES-256-GCM Session Encryption**: Encrypts all payloads over the USB bulk endpoints using the session key established during Phase 0 ECDH exchange. Includes authentication tag, replay protection via monotonic sequence numbers.
- **libusb Device Discovery**: Scans USB bus for Android devices, matches against known VID/PID pairs, and manages device hotplug events.
- **Native Messaging Protocol Bridge**: Serializes/deserializes JSON from `chrome.runtime.sendNativeMessage`, wraps in the AOA encryption layer, and flushes to USB OUT endpoint.
- **WebRTC Fallback Mode**: When USB is unavailable (no device tethered), transparently falls back to the existing WebRTC transport to maintain connectivity.

## Capabilities

### New Capabilities

- `aoa-2.0-transport`: Full AOA 2.0 protocol implementation in Go — device discovery, accessory mode negotiation, bulk endpoint I/O, hotplug events
- `native-messaging-host`: Chrome Native Messaging host registration and message bridge — stdin/stdout JSON protocol ↔ USB bulk endpoint
- `usb-session-encryption`: AES-256-GCM encrypt/decrypt layer over USB bulk transport with sequence number replay protection
- `aoa-key-exchange`: ECDH (Curve25519) key exchange over the AOA control channel to establish the AES session key
- `transport-fallback-manager`: Seamless WebRTC ↔ USB fallback based on device availability, with connection quality metrics

### Modified Capabilities

- Existing `webrtc-signaling` and `ice-candidate-waterfall` become the fallback transport tier when USB is unavailable
- `offscreen-document-lifecycle` gains awareness of which transport (USB vs WebRTC) is active for connection keepalive decisions

## Impact

- **New project**: `apps/native-host/` — Go module with `main.go`, `aoa/`, `crypto/`, `native-messaging/` packages
- **Browser extension**: New `entrypoints/native-messaging/` handler for `runtime.onConnectNative`; `lib/transport/` abstraction layer that unifies WebRTC + USB behind a common `Transport` interface
- **Android**: Existing `USB_ACCESSORY_ATTACHED` intent filter in companion app manifest must trigger the correct handling path
- **Infrastructure**: No cloud dependencies for transport — USB mode is fully offline-capable
- **Build**: Go cross-compilation for Windows/macOS/Linux; native host manifest JSON for Chrome registration

## V6 Alignment

PHASE 1.5 — Bridge between current WebRTC (Phase 1) and full V6 (Phase 2). This change introduces the USB physical transport without yet adding zkTLS or NDK enclave. The extension can operate in either WebRTC or USB mode; USB mode provides the hardware proximity guarantee needed by V6's threat model.

## Dependencies

- Blocked on: None (standalone Go binary)
- Blocking: `zktls-context-engine` (needs the low-latency transport), `ndk-enclave-pin-vault` (needs raw USB for memory isolation guarantees)
- Related: `vault6-migration-strategy` for the overall phase sequencing
