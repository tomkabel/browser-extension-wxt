package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/smartid/vault6-native-host/aoa"
	sidcrypto "github.com/smartid/vault6-native-host/crypto"
	nm "github.com/smartid/vault6-native-host/native_messaging"
)

const (
	readBufferSize = 65536
	readTimeout    = 5 * time.Second
)

type ReadLoop struct {
	session *Session
	writer  *nm.MessageWriter
	cancel  context.CancelFunc
}

func NewReadLoop(session *Session, writer *nm.MessageWriter) *ReadLoop {
	return &ReadLoop{
		session: session,
		writer:  writer,
	}
}

func (rl *ReadLoop) Start(ctx context.Context) {
	ctx, rl.cancel = context.WithCancel(ctx)
	go rl.poll(ctx)
}

func (rl *ReadLoop) Stop() {
	if rl.cancel != nil {
		rl.cancel()
	}
}

func (rl *ReadLoop) poll(ctx context.Context) {
	buf := make([]byte, readBufferSize)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rl.session.mu.Lock()
		dev := rl.session.device
		cs := rl.session.cryptoSession
		var sessionKey []byte
		var seq *sidcrypto.SequenceTracker
		if cs != nil {
			if cs.Key != nil {
				sessionKey = make([]byte, len(cs.Key))
				copy(sessionKey, cs.Key)
			}
			seq = cs.Seq.Clone()
		}
		rl.session.mu.Unlock()

		if dev == nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		n, err := aoa.ReadBulk(dev.InEndpoint(), buf, readTimeout)
		if err != nil {
			if transferErr, ok := err.(*aoa.TransferError); ok {
				switch transferErr.Kind {
				case aoa.TransferErrTimeout:
					continue
				case aoa.TransferErrDisconnect:
					rl.session.mu.Lock()
					rl.session.connected = false
					rl.session.device = nil
					rl.session.mu.Unlock()
					if wErr := rl.writer.Write(&nm.Message{Type: nm.MsgUsbDisconnected}); wErr != nil {
						return
					}
					return
				default:
					fmt.Fprintf(os.Stderr, "readloop: unexpected transfer error kind=%v: %v\n", transferErr.Kind, transferErr)
				}
			} else {
				fmt.Fprintf(os.Stderr, "readloop: ReadBulk error: %v\n", err)
			}
			continue
		}

		if n == 0 {
			continue
		}

		if sessionKey == nil || seq == nil {
			if wErr := rl.writer.Write(&nm.Message{
				Type:  nm.MsgError,
				Error: "received data but no session key established",
			}); wErr != nil {
				return
			}
			continue
		}

		expectedSeq := seq.ExpectedInbound()
		plaintext, _, decryptErr := sidcrypto.Decrypt(sessionKey, buf[:n], expectedSeq)
		if decryptErr != nil {
			if rekeyableErr, ok := decryptErr.(*sidcrypto.DecryptError); ok {
				if rekeyableErr.Kind == sidcrypto.DecryptErrSequenceGap {
					if wErr := rl.writer.Write(&nm.Message{
						Type:    nm.MsgRekeyResult,
						Success: nm.BoolPtr(false),
						Error:   "sequence gap detected, rekey required",
					}); wErr != nil {
						return
					}
					continue
				}
			}
			if wErr := rl.writer.Write(&nm.Message{
				Type:  nm.MsgError,
				Error: fmt.Sprintf("decrypt error: %v", decryptErr),
			}); wErr != nil {
				return
			}
			continue
		}

		cs.Seq.AdvanceInbound()

		encoded := base64.StdEncoding.EncodeToString(plaintext)
		if wErr := rl.writer.Write(&nm.Message{
			Type: nm.MsgPayloadReceived,
			Data: encoded,
		}); wErr != nil {
			return
		}
	}
}
