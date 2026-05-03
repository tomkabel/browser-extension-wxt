package native_messaging

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

const maxMessageSize = 1024 * 1024 // 1MB

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Data    string          `json:"data,omitempty"`
	Success *bool           `json:"success,omitempty"`
	Error   string          `json:"error,omitempty"`
}

type MessageReader struct {
	reader io.Reader
}

type MessageWriter struct {
	writer io.Writer
}

func NewMessageReader(r io.Reader) *MessageReader {
	return &MessageReader{reader: r}
}

func NewMessageWriter(w io.Writer) *MessageWriter {
	return &MessageWriter{writer: w}
}

func (mr *MessageReader) Read() (*Message, error) {
	var length uint32
	if err := binary.Read(mr.reader, binary.LittleEndian, &length); err != nil {
		return nil, fmt.Errorf("read message length: %w", err)
	}

	if length > maxMessageSize {
		return nil, fmt.Errorf("message too large: %d bytes (max %d)", length, maxMessageSize)
	}

	if length == 0 {
		return nil, fmt.Errorf("empty message (zero length)")
	}

	buf := make([]byte, length)
	if _, err := io.ReadFull(mr.reader, buf); err != nil {
		return nil, fmt.Errorf("read message body: %w", err)
	}

	var msg Message
	if err := json.Unmarshal(buf, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal message: %w", err)
	}

	return &msg, nil
}

func (mw *MessageWriter) Write(msg *Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}

	if len(data) > maxMessageSize {
		return fmt.Errorf("message too large: %d bytes (max %d)", len(data), maxMessageSize)
	}

	length := uint32(len(data))
	if err := binary.Write(mw.writer, binary.LittleEndian, length); err != nil {
		return fmt.Errorf("write message length: %w", err)
	}

	if _, err := mw.writer.Write(data); err != nil {
		return fmt.Errorf("write message body: %w", err)
	}

	if flusher, ok := mw.writer.(interface{ Flush() error }); ok {
		if err := flusher.Flush(); err != nil {
			return fmt.Errorf("flush message: %w", err)
		}
	}

	return nil
}

func BoolPtr(b bool) *bool {
	return &b
}
