package main

import (
	"context"
	"encoding/base64"
	"fmt"
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

func (rl *ReadLoop) Start(ctx context.Context, cryptoSession *sidcrypto.Session) {
	ctx, rl.cancel = context.WithCancel(ctx)
	go rl.poll(ctx, cryptoSession)
}

func (rl *ReadLoop) Stop() {
	if rl.cancel != nil {
		rl.cancel()
	}
}

func (rl *ReadLoop) poll(ctx context.Context, cryptoSession *sidcrypto.Session) {
	buf := make([]byte, readBufferSize)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rl.session.mu.Lock()
		dev := rl.session.device
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
					rl.writer.Write(&nm.Message{Type: nm.MsgUsbDisconnected})
					return
				}
			}
			continue
		}

		if n == 0 {
			continue
		}

		if cryptoSession == nil || cryptoSession.Key == nil {
			rl.writer.Write(&nm.Message{
				Type:  nm.MsgError,
				Error: "received data but no session key established",
			})
			continue
		}

		expectedSeq := cryptoSession.Seq.ExpectedInbound()
		plaintext, _, decryptErr := sidcrypto.Decrypt(cryptoSession.Key, buf[:n], expectedSeq)
		if decryptErr != nil {
			if rekeyableErr, ok := decryptErr.(*sidcrypto.DecryptError); ok {
				if rekeyableErr.Kind == sidcrypto.DecryptErrSequenceGap {
					rl.writer.Write(&nm.Message{
						Type:  nm.MsgRekeyResult,
						Success: nm.BoolPtr(false),
						Error: "sequence gap detected, rekey required",
					})
					continue
				}
			}
			rl.writer.Write(&nm.Message{
				Type:  nm.MsgError,
				Error: fmt.Sprintf("decrypt error: %v", decryptErr),
			})
			continue
		}

		cryptoSession.Seq.AdvanceInbound()

		encoded := base64.StdEncoding.EncodeToString(plaintext)
		rl.writer.Write(&nm.Message{
			Type: nm.MsgPayloadReceived,
			Data: encoded,
		})
	}
}
