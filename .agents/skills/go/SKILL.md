---
name: go
description: Expert in Go/Golang development for SmartID2 native host — native messaging, libusb via cgo, cross-compilation, and project-specific crypto patterns.
---

# Go (Golang) for SmartID2 Native Host

You are an expert in Go 1.22+ development for the SmartID2 browser extension's native messaging host. This host bridges the browser to USB devices (via libusb/cgo) and manages E2EE over stdin/stdout.

## Core Principles

- Write idiomatic Go. Use `gofmt`, `go vet`, and `golangci-lint`.
- Prefer explicit error returns over panics. Never panic on protocol or I/O errors — log and recover gracefully.
- Keep the native messaging host stateless per-process. Each browser spawn is a fresh process.
- Use `context.Context` for cancellation timeouts (e.g., USB read timeouts).
- Avoid `init()` functions. Use explicit constructors (`NewXxx`) with dependency injection.

## Native Messaging Protocol (stdin/stdout)

The host communicates with the browser via length-prefixed JSON messages over stdin/stdout. The first 4 bytes are the message length in native byte order (little-endian on all target platforms).

### Reading a Message

```go
package nmhost

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

const MaxPayloadSize = 16 * 1024 * 1024 // 16 MiB

type Message struct {
	ID      uint32          `json:"id"`
	Type    string          `json:"type,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   string          `json:"error,omitempty"`
}

// ReadMessage reads a length-prefixed JSON message from r.
func ReadMessage(r io.Reader) (*Message, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, fmt.Errorf("read length: %w", err)
	}
	if length > MaxPayloadSize { // 16 MiB max
		return nil, fmt.Errorf("message too large: %d", length)
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, fmt.Errorf("read payload: %w", err)
	}
	var msg Message
	if err := json.Unmarshal(buf, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal message: %w", err)
	}
	return &msg, nil
}
```

### Writing a Message

```go
// WriteMessage writes a length-prefixed JSON message to w.
func WriteMessage(w io.Writer, msg *Message) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}
	if len(payload) > MaxPayloadSize {
		return fmt.Errorf("payload too large: %d > %d", len(payload), MaxPayloadSize)
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(payload))); err != nil {
		return fmt.Errorf("write length: %w", err)
	}
	if _, err := w.Write(payload); err != nil {
		return fmt.Errorf("write payload: %w", err)
	}
	return nil
}
```

### Main Loop Pattern

```go
func Run(r io.Reader, w io.Writer, handler func(*Message) (*Message, error)) error {
	for {
		msg, err := ReadMessage(r)
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil // Browser closed the pipe
			}
			return err
		}
		resp, err := handler(msg)
		if err != nil {
			// Respond with error envelope; do NOT crash
			resp = &Message{Error: err.Error()}
		}
		if resp != nil {
			if err := WriteMessage(w, resp); err != nil {
				return err
			}
		}
	}
}
```

## libusb-1.0 Integration via cgo

SmartID2 uses libusb for direct USB device access (USB AOA bridge, Phase 1.5). This requires cgo.

### Minimal cgo Binding Pattern

```go
package usb

/*
#cgo pkg-config: libusb-1.0
#include <libusb.h>
*/
import "C"
import (
	"fmt"
	"runtime"
	"unsafe"
)

type Context struct {
	ctx *C.libusb_context
}

func NewContext() (*Context, error) {
	var ctx *C.libusb_context
	if ret := C.libusb_init(&ctx); ret < 0 {
		return nil, fmt.Errorf("libusb_init: %d", ret)
	}
	c := &Context{ctx: ctx}
	runtime.SetFinalizer(c, (*Context).Close)
	return c, nil
}

func (c *Context) Close() {
	if c.ctx != nil {
		C.libusb_exit(c.ctx)
		c.ctx = nil
	}
}

func (c *Context) ListDevices() ([]*Device, error) {
	var list **C.libusb_device
	n := C.libusb_get_device_list(c.ctx, &list)
	if n < 0 {
		return nil, fmt.Errorf("libusb_get_device_list: %d", n)
	}
	defer C.libusb_free_device_list(list, 1)

	devices := make([]*Device, 0, n)
	// iterate over C array ...
	return devices, nil
}
```

### cgo Safety Rules

- Never pass Go pointers to C that outlive the C call (CGo pointer rules).
- Use `C.malloc`/`C.free` for buffers handed to libusb async callbacks.
- Pin goroutines that call `libusb_handle_events` with `runtime.LockOSThread`.
- Always `runtime.KeepAlive` Go objects referenced only by C to prevent GC.

## Cross-Compilation

The native host must build for Windows, macOS, and Linux (amd64 + arm64).

### Using Cross-Compilation Toolchains

```bash
# Linux amd64 (native)
GOOS=linux GOARCH=amd64 go build -o dist/smartid2-host-linux-amd64 ./cmd/host

# Linux arm64
GOOS=linux GOARCH=arm64 go build -o dist/smartid2-host-linux-arm64 ./cmd/host

# macOS amd64
GOOS=darwin GOARCH=amd64 go build -o dist/smartid2-host-darwin-amd64 ./cmd/host

# macOS arm64 (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o dist/smartid2-host-darwin-arm64 ./cmd/host

# Windows amd64
GOOS=windows GOARCH=amd64 go build -o dist/smartid2-host-windows-amd64.exe ./cmd/host
```

### macOS Universal Binary

```bash
lipo -create -output dist/smartid2-host-darwin-universal \
  dist/smartid2-host-darwin-amd64 \
  dist/smartid2-host-darwin-arm64
```

### Cross-Compilation with libusb (cgo)

When cgo is required, set `CGO_ENABLED=1` and use a cross-compiler or Zig:

```bash
# Example: cross-compile Linux amd64 with Zig CC
CC="zig cc -target x86_64-linux-gnu" \
CXX="zig c++ -target x86_64-linux-gnu" \
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
go build -o dist/smartid2-host-linux-amd64 ./cmd/host
```

For CI, use `goreleaser` or `dockercross` images with pre-installed cross toolchains.

## Static Compilation

Static binaries avoid runtime dependency issues on target machines. Use `-ldflags`:

```bash
# Fully static Linux binary (no dynamic libc/libusb linkage)
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
go build -ldflags '-extldflags -static' \
  -o dist/smartid2-host-linux-amd64-static ./cmd/host
```

**Caveats**:
- macOS does not support fully static binaries (system security policy).
- Windows static builds may require `mingw-w64` with static libusb.
- If using pure Go (no cgo), `CGO_ENABLED=0` yields a fully static binary automatically.

## Error Handling

Never panic in the native host. Every protocol error, USB error, or crypto failure must be caught and returned as an error response to the browser.

### Custom Error Types

```go
package nmhost

import "fmt"

type ProtocolError struct {
	Op  string
	Err error
}

func (e *ProtocolError) Error() string { return fmt.Sprintf("%s: %v", e.Op, e.Err) }
func (e *ProtocolError) Unwrap() error  { return e.Err }

type USBError struct {
	Code int
	Msg  string
}

func (e *USBError) Error() string { return fmt.Sprintf("usb error %d: %s", e.Code, e.Msg) }
```

### Error Handling in the Main Loop

```go
func safeHandler(msg *Message) (resp *Message, err error) {
	defer func() {
		if r := recover(); r != nil {
			// Log stack trace, but do NOT crash the host
			log.Printf("panic recovered: %v\n%s", r, debug.Stack())
			resp = nil
			err = fmt.Errorf("internal server error")
		}
	}()
	return actualHandler(msg)
}
```

## Project-Specific Crypto Patterns

SmartID2 uses standard library crypto for E2EE in the native host.

### ECDH (P-256)

Use `crypto/ecdh` (Go 1.20+) for key agreement. Do NOT use the older `crypto/elliptic` directly for new code.

```go
package crypto

import (
	"crypto/ecdh"
	"crypto/rand"
	"fmt"
)

func GenerateEphemeralKey() (*ecdh.PrivateKey, error) {
	return ecdh.P256().GenerateKey(rand.Reader)
}

func ECDH(privateKey *ecdh.PrivateKey, peerPublic []byte) ([]byte, error) {
	pub, err := ecdh.P256().NewPublicKey(peerPublic)
	if err != nil {
		return nil, fmt.Errorf("invalid peer public key: %w", err)
	}
	secret, err := privateKey.ECDH(pub)
	if err != nil {
		return nil, fmt.Errorf("ecdh: %w", err)
	}
	return secret, nil
}
```

### HKDF Key Derivation

```go
import (
	"crypto/sha256"
	"io"

	"golang.org/x/crypto/hkdf"
)

func DeriveKeys(sharedSecret, salt, info []byte) (key []byte, err error) {
	hkdfReader := hkdf.New(sha256.New, sharedSecret, salt, info)
	key = make([]byte, 32) // AES-256 key
	if _, err := io.ReadFull(hkdfReader, key); err != nil {
		return nil, fmt.Errorf("hkdf: %w", err)
	}
	return key, nil
}
```

### AES-256-GCM

```go
import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

func Encrypt(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("nonce: %w", err)
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

func Decrypt(key, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm: %w", err)
	}
	if len(ciphertext) < gcm.NonceSize() {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ct := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}
```

### Curve25519 (X25519) Alternative

If the spec switches to Curve25519, use `crypto/ecdh` with `ecdh.X25519()`:

```go
func GenerateX25519Key() (*ecdh.PrivateKey, error) {
	return ecdh.X25519().GenerateKey(rand.Reader)
}
```

## Testing

Use table-driven tests with `testing` and `testify/assert` or `testify/require`.

```go
package nmhost

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReadWriteMessage(t *testing.T) {
	msg := &Message{Type: "ping", Payload: []byte(`{"seq":1}`)}
	var buf bytes.Buffer
	require.NoError(t, WriteMessage(&buf, msg))

	got, err := ReadMessage(&buf)
	require.NoError(t, err)
	assert.Equal(t, "ping", got.Type)
	assert.JSONEq(t, `{"seq":1}`, string(got.Payload))
}
```

### Property-Based Testing with `testing/quick`

```go
func TestEncryptDecryptRoundTrip(t *testing.T) {
	f := func(plaintext []byte) bool {
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return false
		}
		ct, err := Encrypt(key, plaintext)
		if err != nil {
			return false
		}
		pt, err := Decrypt(key, ct)
		if err != nil {
			return false
		}
		return bytes.Equal(plaintext, pt)
	}
	if err := quick.Check(f, nil); err != nil {
		t.Error(err)
	}
}
```

### Mocking USB with Interfaces

```go
type USBDevice interface {
	Read(ctx context.Context, buf []byte) (int, error)
	Write(ctx context.Context, buf []byte) (int, error)
	Close() error
}

type libusbDevice struct{ /* ... */ }

type mockDevice struct {
	readBuf  bytes.Buffer
	writeBuf bytes.Buffer
}
```

## Build and CI

```bash
# Local build
go build -o dist/smartid2-host ./cmd/host

# Run tests
go test ./...

# Race detection
go test -race ./...

# Lint
golangci-lint run ./...

# Vet
go vet ./...
```

## Registry Manifests

The native host requires a host manifest JSON installed per-platform:

- **Windows**: `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.smartid2.host`
- **macOS**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.smartid2.host.json`
- **Linux**: `~/.config/google-chrome/NativeMessagingHosts/com.smartid2.host.json`

Example manifest:

```json
{
  "name": "com.smartid2.host",
  "description": "SmartID2 Native Host",
  "path": "/absolute/path/to/smartid2-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID/"]
}
```
