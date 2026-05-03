package native_messaging

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"testing"
)

func TestReadValidMessage(t *testing.T) {
	payload := `{"type":"ping"}`
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, uint32(len(payload)))
	buf.WriteString(payload)

	reader := NewMessageReader(&buf)
	msg, err := reader.Read()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if msg.Type != "ping" {
		t.Errorf("expected type 'ping', got %q", msg.Type)
	}
}

func TestReadMalformedJSON(t *testing.T) {
	payload := `{not valid json}`
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, uint32(len(payload)))
	buf.WriteString(payload)

	reader := NewMessageReader(&buf)
	_, err := reader.Read()
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestReadTruncatedMessage(t *testing.T) {
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, uint32(100))
	buf.WriteString("short")

	reader := NewMessageReader(&buf)
	_, err := reader.Read()
	if err == nil {
		t.Fatal("expected error for truncated message")
	}
}

func TestReadZeroLength(t *testing.T) {
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, uint32(0))

	reader := NewMessageReader(&buf)
	_, err := reader.Read()
	if err == nil {
		t.Fatal("expected error for zero-length message")
	}
}

func TestReadOversizedMessage(t *testing.T) {
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, uint32(maxMessageSize+1))

	reader := NewMessageReader(&buf)
	_, err := reader.Read()
	if err == nil {
		t.Fatal("expected error for oversized message")
	}
}

func TestWriteAndReadRoundtrip(t *testing.T) {
	var buf bytes.Buffer
	writer := NewMessageWriter(&buf)

	success := true
	msg := &Message{Type: "connect-result", Success: &success}
	if err := writer.Write(msg); err != nil {
		t.Fatalf("write error: %v", err)
	}

	reader := NewMessageReader(&buf)
	got, err := reader.Read()
	if err != nil {
		t.Fatalf("read error: %v", err)
	}
	if got.Type != "connect-result" {
		t.Errorf("expected type 'connect-result', got %q", got.Type)
	}
	if got.Success == nil || !*got.Success {
		t.Error("expected success=true")
	}
}

func TestReadEOF(t *testing.T) {
	var buf bytes.Buffer
	reader := NewMessageReader(&buf)
	_, err := reader.Read()
	if err == nil {
		t.Fatal("expected error on empty reader")
	}
}

func TestWriteMultipleMessages(t *testing.T) {
	var buf bytes.Buffer
	writer := NewMessageWriter(&buf)

	for i := 0; i < 3; i++ {
		msg := &Message{Type: "test"}
		if err := writer.Write(msg); err != nil {
			t.Fatalf("write %d error: %v", i, err)
		}
	}

	reader := NewMessageReader(&buf)
	for i := 0; i < 3; i++ {
		msg, err := reader.Read()
		if err != nil {
			t.Fatalf("read %d error: %v", i, err)
		}
		if msg.Type != "test" {
			t.Errorf("message %d: expected type 'test', got %q", i, msg.Type)
		}
	}
}

func TestMessageWithPayload(t *testing.T) {
	payloadData := StatusPayload{
		Connected: true,
		Transport: "usb",
		LatencyMs: 5,
	}
	payload, err := json.Marshal(payloadData)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	var buf bytes.Buffer
	writer := NewMessageWriter(&buf)
	msg := &Message{Type: "status", Payload: json.RawMessage(payload)}
	if err := writer.Write(msg); err != nil {
		t.Fatalf("write error: %v", err)
	}

	reader := NewMessageReader(&buf)
	got, err := reader.Read()
	if err != nil {
		t.Fatalf("read error: %v", err)
	}
	if got.Type != "status" {
		t.Errorf("expected type 'status', got %q", got.Type)
	}

	var status StatusPayload
	if err := json.Unmarshal(got.Payload, &status); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if !status.Connected {
		t.Error("expected connected=true")
	}
	if status.Transport != "usb" {
		t.Errorf("expected transport 'usb', got %q", status.Transport)
	}
}
