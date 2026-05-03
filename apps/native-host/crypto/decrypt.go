package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/binary"
	"fmt"
)

type DecryptError struct {
	Kind    DecryptErrorKind
	Message string
}

type DecryptErrorKind int

const (
	DecryptErrReplay DecryptErrorKind = iota
	DecryptErrSequenceGap
	DecryptErrAuth
	DecryptErrFormat
)

func (e *DecryptError) Error() string {
	return fmt.Sprintf("decrypt error (%d): %s", e.Kind, e.Message)
}

func Decrypt(sessionKey []byte, wire []byte, expectedSeq uint64) ([]byte, uint64, error) {
	return DecryptWithDirection(sessionKey, wire, expectedSeq, DirectionDeviceToHost)
}

func DecryptWithDirection(sessionKey []byte, wire []byte, expectedSeq uint64, direction byte) ([]byte, uint64, error) {
	if len(sessionKey) != SessionKeySize {
		return nil, 0, fmt.Errorf("invalid session key size: %d (expected %d)", len(sessionKey), SessionKeySize)
	}

	if len(wire) < SequenceSize+AuthTagSize {
		return nil, 0, &DecryptError{
			Kind:    DecryptErrFormat,
			Message: fmt.Sprintf("wire data too short: %d bytes (min %d)", len(wire), SequenceSize+AuthTagSize),
		}
	}

	seqNum := binary.BigEndian.Uint64(wire[:SequenceSize])

	if seqNum < expectedSeq {
		return nil, 0, &DecryptError{
			Kind:    DecryptErrReplay,
			Message: fmt.Sprintf("sequence %d < expected %d (replay)", seqNum, expectedSeq),
		}
	}

	if seqNum > expectedSeq {
		return nil, 0, &DecryptError{
			Kind:    DecryptErrSequenceGap,
			Message: fmt.Sprintf("sequence %d > expected %d (gap)", seqNum, expectedSeq),
		}
	}

	block, err := aes.NewCipher(sessionKey)
	if err != nil {
		return nil, 0, fmt.Errorf("create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, 0, fmt.Errorf("create GCM: %w", err)
	}

	iv := buildIV(direction, seqNum)

	ciphertext := wire[SequenceSize:]

	plaintext, err := gcm.Open(nil, iv[:], ciphertext, nil)
	if err != nil {
		return nil, 0, &DecryptError{
			Kind:    DecryptErrAuth,
			Message: "GCM authentication failed",
		}
	}

	return plaintext, seqNum, nil
}
