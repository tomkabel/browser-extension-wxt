package native_messaging

import "encoding/json"

const (
	MsgConnect        = "connect"
	MsgConnectResult  = "connect-result"
	MsgSendPayload    = "send-payload"
	MsgSendResult     = "send-result"
	MsgDisconnect     = "disconnect"
	MsgDisconnectResult = "disconnect-result"
	MsgGetStatus      = "get-status"
	MsgStatus         = "status"
	MsgRekey          = "rekey"
	MsgRekeyResult    = "rekey-result"
	MsgPing           = "ping"
	MsgPong           = "pong"
	MsgPayloadReceived = "payload-received"
	MsgUsbConnected   = "usb-connected"
	MsgUsbDisconnected = "usb-disconnected"
	MsgError          = "error"
)

type StatusPayload struct {
	Connected    bool   `json:"connected"`
	Transport    string `json:"transport"`
	LatencyMs    int64  `json:"latencyMs"`
	DeviceSerial string `json:"deviceSerial,omitempty"`
}

func MarshalStatus(s StatusPayload) (json.RawMessage, error) {
	data, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(data), nil
}
