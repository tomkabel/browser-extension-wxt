package crypto

import (
	"fmt"
	"io"
	"sync"
)

type SessionSnapshot struct {
	Key []byte
	Seq *SequenceTracker
}

type RekeyableSession struct {
	mu      sync.Mutex
	session *Session
	rw      io.ReadWriter
}

func NewRekeyableSession(s *Session, rw io.ReadWriter) *RekeyableSession {
	return &RekeyableSession{session: s, rw: rw}
}

func (rs *RekeyableSession) GetSession() SessionSnapshot {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	keyCopy := make([]byte, len(rs.session.Key))
	copy(keyCopy, rs.session.Key)
	return SessionSnapshot{
		Key: keyCopy,
		Seq: rs.session.Seq.Clone(),
	}
}

func (rs *RekeyableSession) Rekey() error {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	oldKey := rs.session.Key
	oldSeq := rs.session.Seq

	newSession, err := PerformHostKeyExchange(rs.rw)
	if err != nil {
		return fmt.Errorf("rekey failed: %w", err)
	}

	rs.session = newSession

	ZeroSessionKey(&oldKey)
	oldSeq.Reset()

	return nil
}

func (rs *RekeyableSession) ShouldRekey(err error) bool {
	if decryptErr, ok := err.(*DecryptError); ok {
		return decryptErr.Kind == DecryptErrSequenceGap
	}
	return false
}

func (rs *RekeyableSession) Zero() {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	if rs.session != nil {
		rs.session.Zero()
	}
}
