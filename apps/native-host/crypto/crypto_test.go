package crypto

import (
	"bytes"
	"testing"
)

func TestEncryptDecryptRoundtrip(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := []byte("hello, SmartID Vault!")

	ciphertext, err := EncryptWithDirection(key, plaintext, 0, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	decrypted, seq, err := DecryptWithDirection(key, ciphertext, 0, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}

	if seq != 0 {
		t.Errorf("sequence = %d, want 0", seq)
	}
	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("decrypted = %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptDecryptMultipleMessages(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = byte(i + 42)
	}

	for seq := uint64(0); seq < 10; seq++ {
		plaintext := []byte("message")

		ciphertext, err := EncryptWithDirection(key, plaintext, seq, DirectionDeviceToHost)
		if err != nil {
			t.Fatalf("Encrypt seq %d: %v", seq, err)
		}

		decrypted, gotSeq, err := DecryptWithDirection(key, ciphertext, seq, DirectionDeviceToHost)
		if err != nil {
			t.Fatalf("Decrypt seq %d: %v", seq, err)
		}

		if gotSeq != seq {
			t.Errorf("sequence = %d, want %d", gotSeq, seq)
		}
		if !bytes.Equal(decrypted, plaintext) {
			t.Errorf("decrypted mismatch at seq %d", seq)
		}
	}
}

func TestDecryptRejectsReplay(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = byte(i)
	}

	ciphertext, err := EncryptWithDirection(key, []byte("test"), 0, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, _, err = DecryptWithDirection(key, ciphertext, 1, DirectionHostToDevice)
	if err == nil {
		t.Fatal("expected replay error")
	}

	decryptErr, ok := err.(*DecryptError)
	if !ok {
		t.Fatalf("expected DecryptError, got %T", err)
	}
	if decryptErr.Kind != DecryptErrReplay {
		t.Errorf("error kind = %d, want DecryptErrReplay", decryptErr.Kind)
	}
}

func TestDecryptRejectsSequenceGap(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = byte(i)
	}

	ciphertext, err := EncryptWithDirection(key, []byte("test"), 5, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, _, err = DecryptWithDirection(key, ciphertext, 0, DirectionHostToDevice)
	if err == nil {
		t.Fatal("expected sequence gap error")
	}

	decryptErr, ok := err.(*DecryptError)
	if !ok {
		t.Fatalf("expected DecryptError, got %T", err)
	}
	if decryptErr.Kind != DecryptErrSequenceGap {
		t.Errorf("error kind = %d, want DecryptErrSequenceGap", decryptErr.Kind)
	}
}

func TestDecryptRejectsWrongKey(t *testing.T) {
	key1 := make([]byte, SessionKeySize)
	key2 := make([]byte, SessionKeySize)
	for i := range key1 {
		key1[i] = byte(i)
		key2[i] = byte(i + 1)
	}

	ciphertext, err := EncryptWithDirection(key1, []byte("test"), 0, DirectionHostToDevice)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, _, err = DecryptWithDirection(key2, ciphertext, 0, DirectionHostToDevice)
	if err == nil {
		t.Fatal("expected authentication error with wrong key")
	}
}

func TestZeroSessionKey(t *testing.T) {
	key := make([]byte, SessionKeySize)
	for i := range key {
		key[i] = 0xFF
	}

	ZeroSessionKey(&key)

	if key != nil {
		t.Error("key should be nil after zeroing")
	}
}

func TestZeroKey(t *testing.T) {
	key := []byte{0xFF, 0xFE, 0xFD, 0xFC}
	ZeroKey(key)

	for i, b := range key {
		if b != 0 {
			t.Errorf("key[%d] = 0x%02X, want 0x00", i, b)
		}
	}
}

func TestBuildIV(t *testing.T) {
	iv := buildIV(DirectionHostToDevice, 0)
	if iv[0] != DirectionHostToDevice {
		t.Errorf("iv[0] = 0x%02X, want 0x%02X", iv[0], DirectionHostToDevice)
	}

	iv2 := buildIV(DirectionDeviceToHost, 42)
	if iv2[0] != DirectionDeviceToHost {
		t.Errorf("iv2[0] = 0x%02X, want 0x%02X", iv2[0], DirectionDeviceToHost)
	}

	if iv == iv2 {
		t.Error("IVs for different directions/sequences should differ")
	}
}

func TestInvalidKeySize(t *testing.T) {
	shortKey := []byte{1, 2, 3}
	_, err := Encrypt(shortKey, []byte("test"), 0)
	if err == nil {
		t.Fatal("expected error for short key")
	}

	_, _, err = Decrypt(shortKey, []byte("test"), 0)
	if err == nil {
		t.Fatal("expected error for short key")
	}
}

func TestDecryptTooShortWire(t *testing.T) {
	key := make([]byte, SessionKeySize)
	_, _, err := Decrypt(key, []byte{1, 2, 3}, 0)
	if err == nil {
		t.Fatal("expected error for too-short wire data")
	}
}
