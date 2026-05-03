package crypto

import (
	"crypto/hkdf"
	"crypto/sha256"
	"fmt"
)

const (
	SessionKeySize = 32
	HKDFInfo       = "smartid-vault-aoa-key-v1"
)

func DeriveSessionKey(sharedSecret []byte) ([]byte, error) {
	if len(sharedSecret) == 0 {
		return nil, fmt.Errorf("shared secret is empty")
	}

	key, err := hkdf.Key(sha256.New, sharedSecret, nil, HKDFInfo, SessionKeySize)
	if err != nil {
		return nil, fmt.Errorf("HKDF key derivation: %w", err)
	}

	return key, nil
}

func ZeroSessionKey(key *[]byte) {
	if key == nil || *key == nil {
		return
	}
	for i := range *key {
		(*key)[i] = 0
	}
	*key = nil
}
