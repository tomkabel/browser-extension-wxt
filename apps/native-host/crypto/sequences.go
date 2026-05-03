package crypto

import (
	"fmt"
	"sync"
)

type SequenceTracker struct {
	mu       sync.Mutex
	outbound uint64
	inbound  uint64
}

func NewSequenceTracker() *SequenceTracker {
	return &SequenceTracker{}
}

func (st *SequenceTracker) NextOutbound() uint64 {
	st.mu.Lock()
	defer st.mu.Unlock()
	seq := st.outbound
	st.outbound++
	return seq
}

func (st *SequenceTracker) ExpectedInbound() uint64 {
	st.mu.Lock()
	defer st.mu.Unlock()
	return st.inbound
}

func (st *SequenceTracker) AdvanceInbound() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.inbound++
}

func (st *SequenceTracker) ValidateInbound(received uint64) error {
	st.mu.Lock()
	defer st.mu.Unlock()

	if received < st.inbound {
		return &DecryptError{
			Kind:    DecryptErrReplay,
			Message: fmt.Sprintf("sequence %d < expected %d", received, st.inbound),
		}
	}

	if received > st.inbound {
		return &DecryptError{
			Kind:    DecryptErrSequenceGap,
			Message: fmt.Sprintf("sequence %d > expected %d", received, st.inbound),
		}
	}

	return nil
}

func (st *SequenceTracker) Reset() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.outbound = 0
	st.inbound = 0
}
