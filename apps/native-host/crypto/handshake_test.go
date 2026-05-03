package crypto

import (
	"bytes"
	"testing"
)

func TestCompleteKeyExchangeFlow(t *testing.T) {
	hostKP, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("host GenerateKeyPair: %v", err)
	}

	deviceKP, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("device GenerateKeyPair: %v", err)
	}

	hostShared, err := ComputeSharedSecret(hostKP.SK, deviceKP.PK)
	if err != nil {
		t.Fatalf("host ComputeSharedSecret: %v", err)
	}

	deviceShared, err := ComputeSharedSecret(deviceKP.SK, hostKP.PK)
	if err != nil {
		t.Fatalf("device ComputeSharedSecret: %v", err)
	}

	if !bytes.Equal(hostShared, deviceShared) {
		t.Fatal("shared secrets should be equal")
	}

	hostKey, err := DeriveSessionKey(hostShared)
	if err != nil {
		t.Fatalf("host DeriveSessionKey: %v", err)
	}

	deviceKey, err := DeriveSessionKey(deviceShared)
	if err != nil {
		t.Fatalf("device DeriveSessionKey: %v", err)
	}

	if !bytes.Equal(hostKey, deviceKey) {
		t.Fatal("session keys should be equal")
	}

	plaintext := []byte("hello from host via USB!")
	ciphertext, err := EncryptWithDirection(hostKey, plaintext, 0, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	decrypted, seq, err := DecryptWithDirection(deviceKey, ciphertext, 0, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}

	if seq != 0 {
		t.Errorf("sequence = %d, want 0", seq)
	}
	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("decrypted = %q, want %q", decrypted, plaintext)
	}

	ZeroKey(hostShared)
	ZeroKey(deviceShared)
	ZeroSessionKey(&hostKey)
	ZeroSessionKey(&deviceKey)
}

func TestSessionRekey(t *testing.T) {
	session := &Session{
		Key: make([]byte, SessionKeySize),
		Seq: NewSequenceTracker(),
	}
	for i := range session.Key {
		session.Key[i] = byte(i)
	}

	session.Seq.NextOutbound()
	session.Seq.NextOutbound()

	oldKey := session.Key
	session.Key = make([]byte, SessionKeySize)
	for i := range session.Key {
		session.Key[i] = byte(i + 100)
	}
	session.Seq.Reset()

	if session.Seq.NextOutbound() != 0 {
		t.Error("sequence should reset to 0 after rekey")
	}

	ZeroSessionKey(&oldKey)
	session.Zero()
}

func TestSequenceTracker(t *testing.T) {
	st := NewSequenceTracker()

	if st.NextOutbound() != 0 {
		t.Error("first outbound should be 0")
	}
	if st.NextOutbound() != 1 {
		t.Error("second outbound should be 1")
	}

	if st.ExpectedInbound() != 0 {
		t.Error("first expected inbound should be 0")
	}

	if err := st.ValidateInbound(0); err != nil {
		t.Fatalf("validate inbound 0: %v", err)
	}
	st.AdvanceInbound()

	if st.ExpectedInbound() != 1 {
		t.Error("expected inbound should be 1 after advance")
	}
}

func TestSequenceTrackerReset(t *testing.T) {
	st := NewSequenceTracker()
	st.NextOutbound()
	st.NextOutbound()
	st.AdvanceInbound()
	st.AdvanceInbound()

	st.Reset()

	if st.NextOutbound() != 0 {
		t.Error("outbound should be 0 after reset")
	}
	if st.ExpectedInbound() != 0 {
		t.Error("inbound should be 0 after reset")
	}
}
