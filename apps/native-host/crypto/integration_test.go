package crypto

import (
	"bytes"
	"testing"
)

func TestFullTransportChainRoundtrip(t *testing.T) {
	hostKP, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("host keypair: %v", err)
	}

	deviceKP, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("device keypair: %v", err)
	}

	hostShared, err := ComputeSharedSecret(hostKP.SK, deviceKP.PK)
	if err != nil {
		t.Fatalf("host shared: %v", err)
	}

	deviceShared, err := ComputeSharedSecret(deviceKP.SK, hostKP.PK)
	if err != nil {
		t.Fatalf("device shared: %v", err)
	}

	hostKey, err := DeriveSessionKey(hostShared)
	if err != nil {
		t.Fatalf("host key: %v", err)
	}

	deviceKey, err := DeriveSessionKey(deviceShared)
	if err != nil {
		t.Fatalf("device key: %v", err)
	}

	hostSeq := NewSequenceTracker()
	deviceSeq := NewSequenceTracker()

	messages := [][]byte{
		[]byte(`{"type":"verify-transaction","amount":"100.00","recipient":"Alice"}`),
		[]byte(`{"type":"credential-response","username":"user","password":"pass"}`),
		[]byte(`{"type":"ping"}`),
		[]byte("small"),
		bytes.Repeat([]byte("x"), 4096),
	}

	for i, plaintext := range messages {
		seq := hostSeq.NextOutbound()

		wire, err := EncryptWithDirection(hostKey, plaintext, seq, DirectionHostToDevice)
		if err != nil {
			t.Fatalf("msg %d encrypt: %v", i, err)
		}

		expectedSeq := deviceSeq.ExpectedInbound()
		decrypted, gotSeq, err := DecryptWithDirection(deviceKey, wire, expectedSeq, DirectionHostToDevice)
		if err != nil {
			t.Fatalf("msg %d decrypt: %v", i, err)
		}

		if gotSeq != seq {
			t.Errorf("msg %d: seq = %d, want %d", i, gotSeq, seq)
		}

		deviceSeq.AdvanceInbound()

		if !bytes.Equal(decrypted, plaintext) {
			t.Errorf("msg %d: decrypted mismatch", i)
		}
	}

	for i, plaintext := range messages {
		seq := deviceSeq.NextOutbound()

		wire, err := EncryptWithDirection(deviceKey, plaintext, seq, DirectionDeviceToHost)
		if err != nil {
			t.Fatalf("reverse msg %d encrypt: %v", i, err)
		}

		expectedSeq := hostSeq.ExpectedInbound()
		decrypted, gotSeq, err := DecryptWithDirection(hostKey, wire, expectedSeq, DirectionDeviceToHost)
		if err != nil {
			t.Fatalf("reverse msg %d decrypt: %v", i, err)
		}

		if gotSeq != seq {
			t.Errorf("reverse msg %d: seq = %d, want %d", i, gotSeq, seq)
		}

		hostSeq.AdvanceInbound()

		if !bytes.Equal(decrypted, plaintext) {
			t.Errorf("reverse msg %d: decrypted mismatch", i)
		}
	}

	ZeroKey(hostShared)
	ZeroKey(deviceShared)
	ZeroSessionKey(&hostKey)
	ZeroSessionKey(&deviceKey)
}

func TestSequenceGapTriggersRekey(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = byte(i)
	}

	st := NewSequenceTracker()

	wire0, _ := EncryptWithDirection(key, []byte("msg0"), 0, DirectionHostToDevice)
	_, _, err := DecryptWithDirection(key, wire0, st.ExpectedInbound(), DirectionHostToDevice)
	if err != nil {
		t.Fatalf("decrypt msg0: %v", err)
	}
	st.AdvanceInbound()

	wire2, _ := EncryptWithDirection(key, []byte("msg2"), 2, DirectionHostToDevice)
	_, _, err = DecryptWithDirection(key, wire2, st.ExpectedInbound(), DirectionHostToDevice)
	if err == nil {
		t.Fatal("expected sequence gap error")
	}

	decryptErr, ok := err.(*DecryptError)
	if !ok {
		t.Fatalf("expected DecryptError, got %T", err)
	}
	if decryptErr.Kind != DecryptErrSequenceGap {
		t.Errorf("error kind = %d, want SequenceGap", decryptErr.Kind)
	}
}

func TestReplayDetection(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = byte(i)
	}

	st := NewSequenceTracker()

	wire, _ := EncryptWithDirection(key, []byte("msg"), 0, DirectionHostToDevice)

	_, _, err := DecryptWithDirection(key, wire, st.ExpectedInbound(), DirectionHostToDevice)
	if err != nil {
		t.Fatalf("first decrypt: %v", err)
	}
	st.AdvanceInbound()

	_, _, err = DecryptWithDirection(key, wire, 1, DirectionHostToDevice)
	if err == nil {
		t.Fatal("expected replay error")
	}
}

func TestKeyZeroing(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = 0xFF
	}

	ZeroSessionKey(&key)

	if key != nil {
		for i, b := range key {
			if b != 0 {
				t.Errorf("key[%d] = 0x%02X, want 0x00", i, b)
			}
		}
	}
}
