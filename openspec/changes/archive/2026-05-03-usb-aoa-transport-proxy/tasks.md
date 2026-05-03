## 1. Go Native Host — Project Setup

- [x] 1.1 Initialize Go module in `apps/native-host/` with `go.mod` (module `github.com/smartid/vault6-native-host`)
- [x] 1.2 Set up Go project structure: `main.go`, `aoa/`, `crypto/`, `native-messaging/` packages
- [x] 1.3 Add `github.com/google/gousb` dependency for libusb bindings
- [x] 1.4 Add `Makefile` with `build` targets for `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64`
- [x] 1.5 Add `go.sum` and verify build compiles on host platform

## 2. Native Messaging Protocol (stdin/stdout JSON)

- [x] 2.1 Implement `native-messaging/message.go` — 4-byte length-prefixed JSON reader/writer on stdin/stdout
- [x] 2.2 Implement `native-messaging/protocol.go` — message type constants (`connect`, `send-payload`, `disconnect`, `get-status`, `rekey`, `ping`)
- [x] 2.3 Implement `native-messaging/router.go` — message dispatch table routing by `type` field
- [x] 2.4 Implement `main.go` — entry point: parse args for manifest registration or run mode, wire router to stdin/stdout
- [x] 2.5 Add unit tests for message framing (valid 4-byte prefix, malformed input, truncated message)
- [x] 2.6 Generate native messaging manifest JSON template (`org.smartid.aoa_host.json`)

## 3. libusb Integration & AOA 2.0 Protocol

- [x] 3.1 Implement `aoa/discovery.go` — USB device enumeration, VID/PID matching, serial number filtering
- [x] 3.2 Implement `aoa/negotiation.go` — AOA 2.0 control transfer state machine (51→52→53→54→55→58)
- [x] 3.3 Implement `aoa/device.go` — device open/close, interface claim, endpoint discovery (0x01/0x81)
- [x] 3.4 Implement `aoa/hotplug.go` — libusb hotplug callback registration for connect/disconnect events
- [x] 3.5 Implement `aoa/transfer.go` — bulk read/write with timeout, error classification (timeout vs disconnect vs permanent)
- [x] 3.6 Wire AOA stack into native messaging router: connect handler triggers discovery + negotiation
- [x] 3.7 Add unit tests for VID/PID matching and negotiation state machine (mock libusb where needed)

## 4. Key Exchange & Session Encryption

- [x] 4.1 Implement `crypto/keyexchange.go` — X25519 keypair generation, shared secret computation via `crypto/ecdh`
- [x] 4.2 Implement `crypto/session.go` — HKDF-SHA256 key derivation with info string `"smartid-vault-aoa-key-v1"`
- [x] 4.3 Implement `crypto/encrypt.go` — AES-256-GCM encrypt with IV construction (direction byte + sequence number)
- [x] 4.4 Implement `crypto/decrypt.go` — AES-256-GCM decrypt with sequence number verification and replay detection
- [x] 4.5 Implement `crypto/sequences.go` — monotonic sequence number tracker with gap detection
- [x] 4.6 Implement key exchange handshake over control channel (send host_pk, receive phone_pk, derive session_key)
- [x] 4.7 Implement session rekey flow triggered by sequence gap or extension `"rekey"` message
- [x] 4.8 Add unit tests: encrypt/decrypt roundtrip, replay rejection, sequence gap detection, key zeroing
- [x] 4.9 Add unit test for complete key exchange flow (simulate both sides)

## 5. Continuous Read Loop & Message Forwarding

- [x] 5.1 Implement background goroutine for continuous bulk IN endpoint polling
- [x] 5.2 Decrypt received payloads and forward as `"payload-received"` messages to extension
- [x] 5.3 Handle read errors: timeout → report degraded, disconnect → cleanup + notify extension
- [x] 5.4 Implement `send-payload` handler: encrypt + bulk OUT write flow
- [x] 5.5 Implement `get-status` handler returning connection state, transport type, and latency
- [x] 5.6 Implement graceful shutdown on SIGTERM: close USB, zero keys, flush stdout

## 6. Browser Extension — Transport Abstraction

- [x] 6.1 Define `Transport` interface in `lib/transport/types.ts` (type, connect, disconnect, send, onMessage, onDisconnect, getLatency, isAvailable)
- [x] 6.2 Implement `UsbTransport` in `lib/transport/UsbTransport.ts` wrapping `chrome.runtime.sendNativeMessage`
- [x] 6.3 Implement `WebRtcTransport` in `lib/transport/WebRtcTransport.ts` wrapping existing data channel
- [x] 6.4 Add message types to `types/index.ts`: `'usb-connected'`, `'usb-disconnected'`, `'transport-changed'`
- [x] 6.5 Add native messaging host name constant and configuration to `lib/transport/config.ts`

## 7. Transport Fallback Manager

- [x] 7.1 Implement `TransportManager` in `lib/transport/TransportManager.ts` with USB-first, WebRTC-fallback strategy
- [x] 7.2 Implement USB availability polling (2s interval after USB connect fails)
- [x] 7.3 Implement seamless switch: migrate active transport, flush pending data, notify listeners
- [x] 7.4 Implement native host availability check via `sendNativeMessage('ping')` with 30s re-check interval
- [x] 7.5 Add `'transport-changed'` event emitter and wire to popup UI
- [x] 7.6 Update `entrypoints/background/messageHandlers.ts` to route messages through TransportManager
- [x] 7.7 Update offscreen document lifecycle to be transport-aware (don't terminate during USB session)

## 8. Popup UI — Transport Indicator

- [x] 8.1 Add transport status to Zustand store (`activeTransport`, `usbAvailable`)
- [x] 8.2 Implement `TransportIndicator` component showing USB/WebRTC icon and status
- [x] 8.3 Add transport change toast notification (3s auto-dismiss)
- [x] 8.4 Wire TransportManager events to store updates and UI refresh

## 9. Integration & E2E Testing

- [x] 9.1 Add E2E test: native messaging host registers and responds to ping
- [x] 9.2 Add E2E test: WebRTC-to-USB fallback when USB becomes available
- [x] 9.3 Add E2E test: USB-to-WebRTC fallback on disconnect
- [x] 9.4 Add integration test: complete AOA handshake with mock USB device
- [x] 9.5 Add integration test: encrypt/decrypt roundtrip through full transport chain
- [x] 9.6 Run `bun run lint && bun run typecheck` and fix all issues
- [x] 9.7 Run `bun run test` and ensure all existing tests pass with new transport code
- [x] 9.8 Manual QA: verify cross-platform Go binary builds for all 5 targets
