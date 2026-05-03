package crypto

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"time"
)

const (
	MsgTypeHostPK      byte = 0x01
	MsgTypeDevicePK    byte = 0x02
	MsgTypeExchangeOK  byte = 0x03
	MsgTypeError       byte = 0xFF

	KeyExchangeTimeout = 10 * time.Second
)

type KeyExchangeMsg struct {
	Type    byte
	Payload []byte
}

type Session struct {
	Key      []byte
	Seq      *SequenceTracker
	hostSK   []byte
}

func writeFull(w io.Writer, buf []byte) error {
	for len(buf) > 0 {
		n, err := w.Write(buf)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		buf = buf[n:]
	}
	return nil
}

func WriteKeyExchangeMsg(w io.Writer, msgType byte, payload []byte) error {
	header := make([]byte, 3)
	header[0] = msgType
	binary.BigEndian.PutUint16(header[1:], uint16(len(payload)))

	if err := writeFull(w, header); err != nil {
		return fmt.Errorf("write kex header: %w", err)
	}
	if len(payload) > 0 {
		if err := writeFull(w, payload); err != nil {
			return fmt.Errorf("write kex payload: %w", err)
		}
	}
	return nil
}

func ReadKeyExchangeMsg(r io.Reader) (*KeyExchangeMsg, error) {
	header := make([]byte, 3)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, fmt.Errorf("read kex header: %w", err)
	}

	msgType := header[0]
	length := binary.BigEndian.Uint16(header[1:])

	payload := make([]byte, length)
	if length > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return nil, fmt.Errorf("read kex payload: %w", err)
		}
	}

	return &KeyExchangeMsg{Type: msgType, Payload: payload}, nil
}

func setDeadline(rw io.ReadWriter) {
	if conn, ok := rw.(net.Conn); ok {
		conn.SetDeadline(time.Now().Add(KeyExchangeTimeout))
	}
}

func clearDeadline(rw io.ReadWriter) {
	if conn, ok := rw.(net.Conn); ok {
		conn.SetDeadline(time.Time{})
	}
}

func PerformHostKeyExchange(rw io.ReadWriter) (*Session, error) {
	setDeadline(rw)
	defer clearDeadline(rw)

	kp, err := GenerateKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generate keypair: %w", err)
	}

	if err := WriteKeyExchangeMsg(rw, MsgTypeHostPK, kp.PK); err != nil {
		return nil, fmt.Errorf("send host public key: %w", err)
	}

	msg, err := ReadKeyExchangeMsg(rw)
	if err != nil {
		ZeroKey(kp.PK)
		return nil, fmt.Errorf("receive device public key: %w", err)
	}

	if msg.Type == MsgTypeError {
		ZeroKey(kp.PK)
		return nil, fmt.Errorf("device returned error during key exchange")
	}

	if msg.Type != MsgTypeDevicePK {
		ZeroKey(kp.PK)
		return nil, fmt.Errorf("unexpected message type: 0x%02x (expected 0x%02x)", msg.Type, MsgTypeDevicePK)
	}

	if len(msg.Payload) != PublicKeySize {
		ZeroKey(kp.PK)
		return nil, fmt.Errorf("invalid device public key size: %d (expected %d)", len(msg.Payload), PublicKeySize)
	}

	shared, err := ComputeSharedSecret(kp.SK, msg.Payload)
	if err != nil {
		ZeroKey(kp.PK)
		return nil, fmt.Errorf("compute shared secret: %w", err)
	}

	sessionKey, err := DeriveSessionKey(shared)
	if err != nil {
		ZeroKey(kp.PK)
		ZeroKey(shared)
		return nil, fmt.Errorf("derive session key: %w", err)
	}

	ZeroKey(kp.PK)
	ZeroKey(shared)

	if err := WriteKeyExchangeMsg(rw, MsgTypeExchangeOK, nil); err != nil {
		ZeroSessionKey(&sessionKey)
		return nil, fmt.Errorf("send exchange complete: %w", err)
	}

	return &Session{
		Key: sessionKey,
		Seq: NewSequenceTracker(),
	}, nil
}

func (s *Session) Zero() {
	if s == nil {
		return
	}
	ZeroSessionKey(&s.Key)
	s.Seq.Reset()
}
