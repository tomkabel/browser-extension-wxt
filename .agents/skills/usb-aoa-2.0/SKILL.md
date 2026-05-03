---
name: usb-aoa-2.0
description: USB Android Open Accessory 2.0 protocol for the Go native host and Android transport. Covers libusb control transfers for accessory mode negotiation, bulk endpoint communication, device discovery, permission handling, AES-256-GCM tunnel over USB bulk endpoints, and cross-platform Go compilation with libusb.
---

# USB AOA 2.0 — Go Native Host + Android Transport

## When to Use

Apply this skill when:
- Implementing Phase 1.5 USB transport in `lib/transport/` or the Go native messaging host
- Debugging Android accessory mode negotiation failures
- Building the Go binary for Windows, macOS, and Linux
- Replacing WebRTC with a hardware-proximity USB tunnel

## Overview

SmartID2 Phase 1.5 introduces a **USB AOA 2.0** bridge:
1. A **Go Native Messaging Host** detects Android devices over USB via `libusb`
2. It negotiates Android Open Accessory (AOA) protocol to put the phone into accessory mode
3. The host establishes **bulk endpoint** communication
4. An **AES-256-GCM tunnel** is layered on top of USB bulk transfers
5. The browser extension communicates with the Go host via **Native Messaging** (`stdin`/`stdout` JSON)

This provides **hardware proximity** guarantees (MITM is impossible without physical access) and eliminates dependency on cloud signaling / TURN.

## AOA 2.0 Protocol Negotiation

### Step 1: Discover USB Device

```go
// cmd/usb-host/discovery.go
package main

import (
	"fmt"
	"log"

	"github.com/google/gousb"
)

const (
	GoogleVendorID = 0x18D1
	AOAProductID   = 0x2D00 // AOA mode product ID
	AOAADBProductID = 0x2D01 // AOA + ADB
)

type DeviceInfo struct {
	VendorID  uint16
	ProductID uint16
	Serial    string
}

func findAndroidDevice(ctx *gousb.Context) (*gousb.Device, error) {
	// First, check if device is already in AOA mode
	devs, err := ctx.OpenDevices(func(desc *gousb.DeviceDesc) bool {
		return desc.Vendor == GoogleVendorID &&
			(desc.Product == AOAProductID || desc.Product == AOAADBProductID)
	})
	if err != nil {
		return nil, err
	}
	if len(devs) > 0 {
		return devs[0], nil
	}

	// Otherwise search by known Android vendor IDs
	knownVendors := []uint16{0x18D1, 0x04E8, 0x0BB4, 0x12D1, 0x19D2, 0x2A45}
	for _, vid := range knownVendors {
		devs, _ = ctx.OpenDevices(func(desc *gousb.DeviceDesc) bool {
			return desc.Vendor == vid
		})
		if len(devs) > 0 {
			return devs[0], nil
		}
	}
	return nil, fmt.Errorf("no android device found")
}
```

### Step 2: Send AOA Accessory Identities

AOA protocol requires the host to send identity strings via control transfer `SETUP` packets:

```go
const (
	USB_DIR_OUT       = 0x00
	USB_TYPE_VENDOR   = 0x40
	AOA_SEND_STRING   = 52
	AOA_START_ACCESSORY = 53
)

func sendAOAStrings(dev *gousb.Device) error {
	identities := []string{
		"SmartID2",      // manufacturer
		"VaultBridge",   // model
		"SmartID2 USB Transport", // description
		"1.0",           // version
		"https://smartid.dev", // URI
		"SmartID2 Serial", // serial
	}

	for i, s := range identities {
		data := []byte(s)
		_, err := dev.Control(USB_DIR_OUT|USB_TYPE_VENDOR, AOA_SEND_STRING, 0, uint16(i), data)
		if err != nil {
			return fmt.Errorf("send identity %d failed: %w", i, err)
		}
	}
	return nil
}

func startAccessoryMode(dev *gousb.Device) error {
	_, err := dev.Control(USB_DIR_OUT|USB_TYPE_VENDOR, AOA_START_ACCESSORY, 0, 0, nil)
	return err
}
```

### Step 3: Re-enumerate and Claim Bulk Endpoints

After `AOA_START_ACCESSORY`, the device disconnects and reconnects with the AOA PID. The host must wait and re-open:

```go
func claimBulkEndpoints(dev *gousb.Device) (in, out *gousb.InEndpoint, close func(), err error) {
	cfg, err := dev.Config(1)
	if err != nil {
		return nil, nil, nil, err
	}

	iface, err := cfg.Interface(0, 0)
	if err != nil {
		cfg.Close()
		return nil, nil, nil, err
	}
	// cfg and iface must stay open for the endpoint session lifetime

	for _, desc := range iface.Setting.Endpoints {
		if desc.Direction == gousb.EndpointDirectionIn && in == nil {
			in, err = iface.InEndpoint(desc.Number)
			if err != nil {
				cfg.Close()
				return nil, nil, nil, err
			}
		}
		if desc.Direction == gousb.EndpointDirectionOut && out == nil {
			out, err = iface.OutEndpoint(desc.Number)
			if err != nil {
				cfg.Close()
				return nil, nil, nil, err
			}
		}
	}

	if in == nil || out == nil {
		cfg.Close()
		return nil, nil, nil, fmt.Errorf("missing bulk endpoints")
	}
	return in, out, cfg.Close, nil
}

// Caller must defer close() to keep the config alive for endpoint I/O.
// Example:
//
//	in, out, closeCfg, err := claimBulkEndpoints(dev)
//	if err != nil { ... }
//	defer closeCfg()
```

## AES-256-GCM Tunnel over Bulk Endpoints

USB bulk transfers have a max packet size of 512 bytes (USB 2.0) or 1024 bytes (USB 3.0). The tunnel frames length-prefixed ciphertext:

```go
// tunnel.go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"io"

	"github.com/google/gousb"
)

type USBTunnel struct {
	in      *gousb.InEndpoint
	out     *gousb.OutEndpoint
	cipher  cipher.AEAD
	mu      sync.Mutex
	seq     uint64
}

const maxPayload = 4096 // tunneled message max size
const frameOverhead = 16 // auth tag

func NewUSBTunnel(in *gousb.InEndpoint, out *gousb.OutEndpoint, key []byte) (*USBTunnel, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &USBTunnel{
		in:     in,
		out:    out,
		cipher: aead,
	}, nil
}

func (t *USBTunnel) WriteMessage(data []byte) error {
	// Frame: [4 bytes length][ciphertext][16 byte tag]
	if len(data) > maxPayload {
		return fmt.Errorf("payload too large")
	}

	t.mu.Lock()
	nonce := make([]byte, t.cipher.NonceSize())
	rand.Read(nonce)
	aad := make([]byte, 12)
	binary.BigEndian.PutUint64(aad[4:], t.seq)
	t.seq++
	ciphertext := t.cipher.Seal(nil, nonce, data, aad)
	t.mu.Unlock()

	frame := make([]byte, 4+len(nonce)+len(ciphertext))
	binary.BigEndian.PutUint32(frame[0:4], uint32(len(nonce)+len(ciphertext)))
	copy(frame[4:], nonce)
	copy(frame[4+len(nonce):], ciphertext)

	_, err := t.out.Write(frame)
	return err
}

func (t *USBTunnel) ReadMessage() ([]byte, error) {
	// Read 4-byte length
	lenBuf := make([]byte, 4)
	if _, err := io.ReadFull(t.in, lenBuf); err != nil {
		return nil, err
	}
	length := binary.BigEndian.Uint32(lenBuf)
	if length > maxPayload+32 {
		return nil, fmt.Errorf("frame too large")
	}

	// Read ciphertext + tag
	buf := make([]byte, length)
	if _, err := io.ReadFull(t.in, buf); err != nil {
		return nil, err
	}

	nonce := buf[:t.cipher.NonceSize()]
	ciphertext := buf[t.cipher.NonceSize():]
	return t.cipher.Open(nil, nonce, ciphertext, nil)
}
```

## Native Messaging Bridge

The Go host communicates with the Chrome extension via JSON over `stdin`/`stdout`:

```go
// nativemsg.go
package main

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
)

type NativeMessage struct {
	Type    string `json:"type"`
	Payload []byte `json:"payload,omitempty"`
}

func readNativeMessage(r io.Reader) (*NativeMessage, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, err
	}
	var msg NativeMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

func writeNativeMessage(w io.Writer, msg *NativeMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(data))); err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}
```

## Cross-Platform Build

```bash
# Build the native messaging host for all platforms
GOOS=darwin  GOARCH=amd64 go build -o dist/usb-host-darwin-amd64 ./cmd/usb-host
GOOS=darwin  GOARCH=arm64 go build -o dist/usb-host-darwin-arm64 ./cmd/usb-host
GOOS=linux   GOARCH=amd64 go build -o dist/usb-host-linux-amd64 ./cmd/usb-host
GOOS=windows GOARCH=amd64 go build -o dist/usb-host-windows-amd64.exe ./cmd/usb-host
```

**libusb dependency**:
- macOS: `brew install libusb`
- Linux: `sudo apt-get install libusb-1.0-0-dev`
- Windows: include `libusb-1.0.dll` alongside the binary

## Permission Handling

On Linux, the user needs udev rules to access USB devices without root:

```udev
# /etc/udev/rules.d/51-smartid2.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", ATTR{idProduct}=="2d00", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", ATTR{idProduct}=="2d01", MODE="0666", GROUP="plugdev"
```

On macOS, no extra permissions are needed for user-space USB.
On Windows, the WinUSB driver may be required (use Zadig for generic devices).

## Native Messaging Manifest

```json
{
  "name": "dev.smartid2.usbhost",
  "description": "SmartID2 USB AOA Transport",
  "path": "/opt/smartid2/usb-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID/"]
}
```

## Common Pitfalls

1. **AOA mode requires the Android app to not be running** or to explicitly release the USB interface. If the app holds the accessory, the host cannot claim endpoints.
2. **Bulk transfer timeout**: Default libusb timeout is infinite. Set a 5s timeout to detect cable disconnects.
3. **Packet size fragmentation**: If `Write()` exceeds the endpoint max packet size, libusb fragments automatically. However, `Read()` may return partial frames — always length-prefix.
4. **Endianness**: USB control transfers are little-endian for data, but SmartID2 uses big-endian for the length prefix (network byte order).

## References

- [Android Open Accessory Protocol 2.0](https://source.android.com/docs/core/interaction/accessories/aoa2)
- `lib/transport/UsbTransport.ts`
- `openspec/specs/aoa-2.0-transport/spec.md`
- `openspec/specs/aoa-key-exchange/spec.md`
