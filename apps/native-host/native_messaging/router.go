package native_messaging

import (
	"fmt"
)

type Handler func(msg *Message) (*Message, error)

type Router struct {
	handlers map[string]Handler
}

func NewRouter() *Router {
	return &Router{
		handlers: make(map[string]Handler),
	}
}

func (r *Router) Register(msgType string, handler Handler) {
	r.handlers[msgType] = handler
}

func (r *Router) Dispatch(msg *Message) (*Message, error) {
	if msg == nil {
		return &Message{
			Type:  MsgError,
			Error: "nil message",
		}, nil
	}

	handler, ok := r.handlers[msg.Type]
	if !ok {
		errMsg := &Message{
			Type:  MsgError,
			Error: fmt.Sprintf("unknown message type: %s", msg.Type),
		}
		return errMsg, nil
	}

	resp, err := handler(msg)
	if err != nil {
		errMsg := &Message{
			Type:  MsgError,
			Error: err.Error(),
		}
		return errMsg, nil
	}

	return resp, nil
}
