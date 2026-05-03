package main

import (
	"errors"
	"io"
	"testing"
	"time"

	"github.com/smartid/vault6-native-host/aoa"
	sidcrypto "github.com/smartid/vault6-native-host/crypto"
	nm "github.com/smartid/vault6-native-host/native_messaging"
)

func makeSession() *Session {
	return &Session{
		device:    &aoa.AoaDevice{},
		usbRW:     &usbReadWriter{},
		connected: true,
		cryptoSession: &sidcrypto.Session{
			Key: make([]byte, 32),
			Seq: sidcrypto.NewSequenceTracker(),
		},
		connectedAt: time.Now(),
	}
}

func registerAndDispatch(t *testing.T, session *Session, msg *nm.Message) (*nm.Message, error) {
	t.Helper()
	router := nm.NewRouter()
	registerHandlers(router, session, nm.NewMessageWriter(io.Discard))
	return router.Dispatch(msg)
}

func TestRekey_Success(t *testing.T) {
	savedKex := performKeyExchange
	savedRL := startReadLoop
	defer func() {
		performKeyExchange = savedKex
		startReadLoop = savedRL
	}()

	readLoopStarted := false
	startReadLoop = func(session *Session, writer *nm.MessageWriter) *ReadLoop {
		readLoopStarted = true
		return &ReadLoop{}
	}

	performKeyExchange = func(rw io.ReadWriter) (*sidcrypto.Session, error) {
		return &sidcrypto.Session{
			Key: make([]byte, 32),
			Seq: sidcrypto.NewSequenceTracker(),
		}, nil
	}

	session := makeSession()
	resp, err := registerAndDispatch(t, session, &nm.Message{Type: nm.MsgRekey})
	if err != nil {
		t.Fatalf("dispatch error: %v", err)
	}
	if resp.Success == nil || !*resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if !readLoopStarted {
		t.Error("expected read loop to be started on rekey success")
	}
}

func TestRekey_Failure_DevicePresent(t *testing.T) {
	savedKex := performKeyExchange
	savedRL := startReadLoop
	defer func() {
		performKeyExchange = savedKex
		startReadLoop = savedRL
	}()

	readLoopStarted := false
	startReadLoop = func(session *Session, writer *nm.MessageWriter) *ReadLoop {
		readLoopStarted = true
		return &ReadLoop{}
	}

	performKeyExchange = func(rw io.ReadWriter) (*sidcrypto.Session, error) {
		return nil, errors.New("kex failed")
	}

	session := makeSession()
	oldCrypto := session.cryptoSession
	resp, err := registerAndDispatch(t, session, &nm.Message{Type: nm.MsgRekey})
	if err != nil {
		t.Fatalf("dispatch error: %v", err)
	}
	if resp.Success != nil && *resp.Success {
		t.Fatal("expected failure, got success")
	}
	if !readLoopStarted {
		t.Error("expected read loop to be restarted after failed rekey with device present")
	}
	if session.cryptoSession != oldCrypto {
		t.Error("expected crypto session to be preserved on rekey failure")
	}
}

func TestRekey_Failure_DeviceDisconnectedDuringIO(t *testing.T) {
	savedKex := performKeyExchange
	savedRL := startReadLoop
	defer func() {
		performKeyExchange = savedKex
		startReadLoop = savedRL
	}()

	blocked := make(chan struct{})
	unblock := make(chan struct{})

	readLoopStarted := false
	startReadLoop = func(session *Session, writer *nm.MessageWriter) *ReadLoop {
		readLoopStarted = true
		return &ReadLoop{}
	}

	performKeyExchange = func(rw io.ReadWriter) (*sidcrypto.Session, error) {
		close(blocked)
		<-unblock
		return nil, errors.New("kex failed: device disconnected")
	}

	session := makeSession()
	router := nm.NewRouter()
	registerHandlers(router, session, nm.NewMessageWriter(io.Discard))

	respCh := make(chan *nm.Message, 1)
	errCh := make(chan error, 1)
	go func() {
		resp, err := router.Dispatch(&nm.Message{Type: nm.MsgRekey})
		if err != nil {
			errCh <- err
			return
		}
		respCh <- resp
	}()

	<-blocked

	// Simulate session.Close() — device disconnected while key exchange in flight
	session.mu.Lock()
	session.device = nil
	session.usbRW = nil
	session.cryptoSession = nil
	session.mu.Unlock()

	close(unblock)

	select {
	case resp := <-respCh:
		if resp.Success != nil && *resp.Success {
			t.Fatal("expected failure, got success")
		}
		if readLoopStarted {
			t.Error("expected read loop NOT to be restarted after device disconnected")
		}
	case err := <-errCh:
		t.Fatalf("dispatch error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for response")
	}
}

func TestRekey_Failure_TOCTOU_DeviceSwapped(t *testing.T) {
	savedKex := performKeyExchange
	savedRL := startReadLoop
	defer func() {
		performKeyExchange = savedKex
		startReadLoop = savedRL
	}()

	blocked := make(chan struct{})
	unblock := make(chan struct{})

	readLoopStarted := false
	startReadLoop = func(session *Session, writer *nm.MessageWriter) *ReadLoop {
		readLoopStarted = true
		return &ReadLoop{}
	}

	performKeyExchange = func(rw io.ReadWriter) (*sidcrypto.Session, error) {
		close(blocked)
		<-unblock
		return nil, errors.New("kex failed")
	}

	session := makeSession()
	oldCrypto := session.cryptoSession
	router := nm.NewRouter()
	registerHandlers(router, session, nm.NewMessageWriter(io.Discard))

	respCh := make(chan *nm.Message, 1)
	errCh := make(chan error, 1)
	go func() {
		resp, err := router.Dispatch(&nm.Message{Type: nm.MsgRekey})
		if err != nil {
			errCh <- err
			return
		}
		respCh <- resp
	}()

	<-blocked

	// Simulate MsgConnect completing with a new device while we were unlocked
	session.mu.Lock()
	session.device = &aoa.AoaDevice{}
	session.usbRW = &usbReadWriter{}
	session.mu.Unlock()

	close(unblock)

	select {
	case resp := <-respCh:
		if resp.Success != nil && *resp.Success {
			t.Fatal("expected failure, got success")
		}
		if readLoopStarted {
			t.Error("expected read loop NOT to be restarted (stale usbRW)")
		}

		session.mu.Lock()
		if session.cryptoSession != oldCrypto {
			t.Error("expected original crypto session to be preserved on device swap")
		}
		session.mu.Unlock()
	case err := <-errCh:
		t.Fatalf("dispatch error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for response")
	}
}

func TestRekey_Success_TOCTOU_DeviceSwapped(t *testing.T) {
	savedKex := performKeyExchange
	savedRL := startReadLoop
	defer func() {
		performKeyExchange = savedKex
		startReadLoop = savedRL
	}()

	blocked := make(chan struct{})
	unblock := make(chan struct{})

	readLoopStarted := false
	startReadLoop = func(session *Session, writer *nm.MessageWriter) *ReadLoop {
		readLoopStarted = true
		return &ReadLoop{}
	}

	performKeyExchange = func(rw io.ReadWriter) (*sidcrypto.Session, error) {
		close(blocked)
		<-unblock
		return &sidcrypto.Session{
			Key: make([]byte, 32),
			Seq: sidcrypto.NewSequenceTracker(),
		}, nil
	}

	session := makeSession()
	oldCrypto := session.cryptoSession
	router := nm.NewRouter()
	registerHandlers(router, session, nm.NewMessageWriter(io.Discard))

	respCh := make(chan *nm.Message, 1)
	errCh := make(chan error, 1)
	go func() {
		resp, err := router.Dispatch(&nm.Message{Type: nm.MsgRekey})
		if err != nil {
			errCh <- err
			return
		}
		respCh <- resp
	}()

	<-blocked

	// Simulate device swap while key exchange succeeded
	session.mu.Lock()
	session.device = &aoa.AoaDevice{}
	session.usbRW = &usbReadWriter{}
	session.mu.Unlock()

	close(unblock)

	select {
	case resp := <-respCh:
		if resp.Success != nil && *resp.Success {
			t.Fatal("expected failure when device swapped during rekey")
		}
		if !readLoopStarted {
			t.Error("expected read loop to be restarted even on swap failure")
		}

		session.mu.Lock()
		if session.cryptoSession != oldCrypto {
			t.Error("expected original crypto session to be preserved on device swap")
		}
		session.mu.Unlock()
	case err := <-errCh:
		t.Fatalf("dispatch error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for response")
	}
}

func TestRekey_NoCryptoSession(t *testing.T) {
	session := &Session{}
	resp, err := registerAndDispatch(t, session, &nm.Message{Type: nm.MsgRekey})
	if err != nil {
		t.Fatalf("dispatch error: %v", err)
	}
	if resp.Success != nil && *resp.Success {
		t.Fatal("expected failure when no crypto session exists")
	}
}

func TestRekey_NoDevice(t *testing.T) {
	session := &Session{
		cryptoSession: &sidcrypto.Session{
			Key: make([]byte, 32),
			Seq: sidcrypto.NewSequenceTracker(),
		},
	}
	resp, err := registerAndDispatch(t, session, &nm.Message{Type: nm.MsgRekey})
	if err != nil {
		t.Fatalf("dispatch error: %v", err)
	}
	if resp.Success != nil && *resp.Success {
		t.Fatal("expected failure when no device")
	}
}
