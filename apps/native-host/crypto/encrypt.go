package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/binary"
	"fmt"
)

const (
	DirectionHostToDevice byte = 0x00
	DirectionDeviceToHost byte = 0x01
	IVSize                     = 12
	AuthTagSize                = 16
	SequenceSize               = 8
	WireOverhead               = SequenceSize + AuthTagSize
)

func buildIV(direction byte, seqNum uint64) [IVSize]byte {
	var iv [IVSize]byte
	iv[0] = direction
	binary.BigEndian.PutUint64(iv[4:], seqNum)
	return iv
}

func Encrypt(sessionKey []byte, plaintext []byte, seqNum uint64) ([]byte, error) {
	return EncryptWithDirection(sessionKey, plaintext, seqNum, DirectionHostToDevice)
}

func EncryptWithDirection(sessionKey []byte, plaintext []byte, seqNum uint64, direction byte) ([]byte, error) {
	if len(sessionKey) != SessionKeySize {
		return nil, fmt.Errorf("invalid session key size: %d (expected %d)", len(sessionKey), SessionKeySize)
	}

	block, err := aes.NewCipher(sessionKey)
	if err != nil {
		return nil, fmt.Errorf("create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	iv := buildIV(direction, seqNum)

	ciphertext := gcm.Seal(nil, iv[:], plaintext, nil)

	wire := make([]byte, SequenceSize+len(ciphertext))
	binary.BigEndian.PutUint64(wire[:SequenceSize], seqNum)
	copy(wire[SequenceSize:], ciphertext)

	return wire, nil
}
