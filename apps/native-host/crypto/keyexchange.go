package crypto

import (
	"crypto/ecdh"
	"crypto/rand"
	"fmt"
)

const (
	PublicKeySize  = 32
	PrivateKeySize = 32
	SharedSize     = 32
)

type KeyPair struct {
	SK *ecdh.PrivateKey
	PK []byte
}

func GenerateKeyPair() (*KeyPair, error) {
	curve := ecdh.X25519()
	sk, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate X25519 keypair: %w", err)
	}

	pk := sk.PublicKey().Bytes()

	return &KeyPair{SK: sk, PK: pk}, nil
}

func ComputeSharedSecret(sk *ecdh.PrivateKey, peerPK []byte) ([]byte, error) {
	curve := ecdh.X25519()
	peerKey, err := curve.NewPublicKey(peerPK)
	if err != nil {
		return nil, fmt.Errorf("parse peer public key: %w", err)
	}

	shared, err := sk.ECDH(peerKey)
	if err != nil {
		return nil, fmt.Errorf("ECDH computation: %w", err)
	}

	return shared, nil
}

func ZeroKey(key []byte) {
	for i := range key {
		key[i] = 0
	}
}
