package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/signal"
	"runtime/debug"
	"sync"
	"syscall"
	"time"

	"github.com/google/gousb"
	"github.com/smartid/vault6-native-host/aoa"
	sidcrypto "github.com/smartid/vault6-native-host/crypto"
	nm "github.com/smartid/vault6-native-host/native_messaging"
)

const (
	version = "0.1.0"
	appName = "smartid-aoa-host"
)

type Session struct {
	mu            sync.Mutex
	device        *aoa.AoaDevice
	usbCtx        *gousb.Context
	connected     bool
	cryptoSession *sidcrypto.Session
	readLoop      *ReadLoop
	connectedAt   time.Time
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version":
			fmt.Printf("%s %s\n", appName, version)
			os.Exit(0)
		case "--register":
			fmt.Println("Registering native messaging host...")
			os.Exit(0)
		case "--unregister":
			fmt.Println("Unregistering native messaging host...")
			os.Exit(0)
		}
	}

	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	usbCtx := gousb.NewContext()
	defer usbCtx.Close()

	session := &Session{usbCtx: usbCtx}
	writer := nm.NewMessageWriter(os.Stdout)
	router := nm.NewRouter()

	registerHandlers(router, session, writer)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	monitor := aoa.NewHotplugMonitor(usbCtx, "", 2*time.Second, func(event aoa.HotplugEvent) {
		switch event.Type {
		case aoa.HotplugConnect:
			fmt.Fprintf(os.Stderr, "USB device connected: %04x:%04x\n", event.Device.Desc.Vendor, event.Device.Desc.Product)
			if err := writer.Write(&nm.Message{Type: nm.MsgUsbConnected}); err != nil {
				fmt.Fprintf(os.Stderr, "failed to write usb-connected message: %v\n", err)
			}
		case aoa.HotplugDisconnect:
			fmt.Fprintf(os.Stderr, "USB device disconnected\n")
			session.Close()
			if err := writer.Write(&nm.Message{Type: nm.MsgUsbDisconnected}); err != nil {
				fmt.Fprintf(os.Stderr, "failed to write usb-disconnected message: %v\n", err)
			}
		}
	})
	monitor.Start(ctx)
	defer monitor.Stop()

	reader := nm.NewMessageReader(os.Stdin)
	errCh := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Fprintf(os.Stderr, "PANIC in stdin goroutine: %v\n%s\n", r, debug.Stack())
				errCh <- fmt.Errorf("panic in stdin goroutine: %v", r)
			}
		}()
		for {
			msg, err := reader.Read()
			if err != nil {
				errCh <- fmt.Errorf("read message: %w", err)
				return
			}

			resp, err := router.Dispatch(msg)
			if err != nil {
				errCh <- fmt.Errorf("dispatch message: %w", err)
				return
			}

			if resp != nil {
				if err := writer.Write(resp); err != nil {
					errCh <- fmt.Errorf("write response: %w", err)
					return
				}
			}
		}
	}()

	select {
	case sig := <-sigCh:
		fmt.Fprintf(os.Stderr, "received signal: %v, shutting down\n", sig)
		session.Close()
		return nil
	case err := <-errCh:
		session.Close()
		return err
	}
}

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closeLocked()
}

func (s *Session) closeLocked() {
	if s.readLoop != nil {
		s.readLoop.Stop()
		s.readLoop = nil
	}
	if s.cryptoSession != nil {
		s.cryptoSession.Zero()
		s.cryptoSession = nil
	}
	if s.device != nil {
		s.device.Close()
		s.device = nil
	}
	s.connected = false
}

func registerHandlers(r *nm.Router, session *Session, writer *nm.MessageWriter) {
	r.Register(nm.MsgPing, func(msg *nm.Message) (*nm.Message, error) {
		return &nm.Message{Type: nm.MsgPong}, nil
	})

	r.Register(nm.MsgConnect, func(msg *nm.Message) (*nm.Message, error) {
		session.mu.Lock()
		defer session.mu.Unlock()

		if session.connected {
			return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(true)}, nil
		}

		discovered, err := aoa.FindAccessoryDevice(session.usbCtx, "")
		if err != nil {
			return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(false), Error: fmt.Sprintf("device discovery failed: %v", err)}, nil
		}

		if discovered == nil {
			return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(false), Error: "no accessory device found"}, nil
		}

		if !discovered.IsAccessory {
			neg := aoa.NewNegotiator(discovered.Serial)
			if err := neg.Negotiate(discovered.Device); err != nil {
				discovered.Device.Close()
				return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(false), Error: fmt.Sprintf("AOA negotiation failed: %v", err)}, nil
			}
			discovered.Device.Close()

			time.Sleep(2 * time.Second)

			discovered, err = aoa.FindAccessoryDevice(session.usbCtx, "")
			if err != nil || discovered == nil {
				return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(false), Error: "device did not re-enumerate as accessory"}, nil
			}
		}

		aoaDev, err := aoa.OpenAoaDevice(discovered.Device)
		if err != nil {
			discovered.Device.Close()
			return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(false), Error: fmt.Sprintf("open accessory device: %v", err)}, nil
		}

		session.device = aoaDev
		session.connected = true
		session.connectedAt = time.Now()

		// TODO: Perform actual ECDH key exchange over USB control channel.
		// This placeholder produces an all-zero session key — acceptable for
		// development/testing but MUST be replaced before production use.
		cryptoSess := &sidcrypto.Session{
			Key: make([]byte, sidcrypto.SessionKeySize),
			Seq: sidcrypto.NewSequenceTracker(),
		}

		session.cryptoSession = cryptoSess

		readLoop := NewReadLoop(session, writer)
		session.readLoop = readLoop
		readLoop.Start(context.Background())

		if err := writer.Write(&nm.Message{Type: nm.MsgUsbConnected}); err != nil {
			fmt.Fprintf(os.Stderr, "failed to write usb-connected message: %v\n", err)
		}
		return &nm.Message{Type: nm.MsgConnectResult, Success: nm.BoolPtr(true)}, nil
	})

	r.Register(nm.MsgSendPayload, func(msg *nm.Message) (*nm.Message, error) {
		session.mu.Lock()
		defer session.mu.Unlock()

		if !session.connected || session.device == nil {
			return &nm.Message{Type: nm.MsgSendResult, Success: nm.BoolPtr(false), Error: "not connected"}, nil
		}

		if session.cryptoSession == nil || session.cryptoSession.Key == nil {
			return &nm.Message{Type: nm.MsgSendResult, Success: nm.BoolPtr(false), Error: "no session key"}, nil
		}

		plaintext, err := base64.StdEncoding.DecodeString(msg.Data)
		if err != nil {
			return &nm.Message{Type: nm.MsgSendResult, Success: nm.BoolPtr(false), Error: "invalid base64 data"}, nil
		}

		seq := session.cryptoSession.Seq.NextOutbound()
		ciphertext, err := sidcrypto.Encrypt(session.cryptoSession.Key, plaintext, seq)
		if err != nil {
			return &nm.Message{Type: nm.MsgSendResult, Success: nm.BoolPtr(false), Error: fmt.Sprintf("encrypt failed: %v", err)}, nil
		}

		_, err = aoa.WriteBulk(session.device.OutEndpoint(), ciphertext, aoa.DefaultTransferTimeout)
		if err != nil {
			return &nm.Message{Type: nm.MsgSendResult, Success: nm.BoolPtr(false), Error: fmt.Sprintf("USB write failed: %v", err)}, nil
		}

		return &nm.Message{Type: nm.MsgSendResult, Success: nm.BoolPtr(true)}, nil
	})

	r.Register(nm.MsgDisconnect, func(msg *nm.Message) (*nm.Message, error) {
		session.Close()
		return &nm.Message{Type: nm.MsgDisconnectResult, Success: nm.BoolPtr(true)}, nil
	})

	r.Register(nm.MsgGetStatus, func(msg *nm.Message) (*nm.Message, error) {
		session.mu.Lock()
		defer session.mu.Unlock()

		var latencyMs int64
		if session.connected {
			latencyMs = time.Since(session.connectedAt).Milliseconds()
		}

		status := nm.StatusPayload{
			Connected: session.connected,
			Transport: "usb",
			LatencyMs: latencyMs,
		}
		payload, _ := nm.MarshalStatus(status)
		return &nm.Message{Type: nm.MsgStatus, Payload: payload}, nil
	})

	r.Register(nm.MsgRekey, func(msg *nm.Message) (*nm.Message, error) {
		session.mu.Lock()
		defer session.mu.Unlock()

		if session.cryptoSession == nil {
			return &nm.Message{Type: nm.MsgRekeyResult, Success: nm.BoolPtr(false), Error: "no active session"}, nil
		}

		// TODO: perform actual rekey over control channel with key rotation.
		// Resetting sequence counters without rotating the AES-GCM key would
		// cause nonce reuse — a critical cryptographic break. Return failure
		// until proper key rotation is implemented.
		return &nm.Message{
			Type:    nm.MsgRekeyResult,
			Success: nm.BoolPtr(false),
			Error:   "rekey not implemented safely: key rotation required",
		}, nil
	})
}
