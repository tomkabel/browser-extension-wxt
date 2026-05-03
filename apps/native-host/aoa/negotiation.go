package aoa

import (
	"fmt"
	"time"

	"github.com/google/gousb"
)

const (
	aoaGetProtocol    = 51
	aoaSendIdent      = 52
	aoaStartAccessory = 58

	aoaManufacturer = "SmartIDVault"
	aoaModel        = "TetheredProxy"
	aoaVersion      = "6.0"
	aoaURI          = "https://smartid-vault.local"

	controlRequestType = 0x40

	maxRetries   = 3
	retryBackoff = 500 * time.Millisecond
)

type NegotiationState int

const (
	StateIdle NegotiationState = iota
	StateProtocolChecked
	StateIdentSent
	StateAccessoryStarted
	StateComplete
	StateFailed
)

type Negotiator struct {
	state  NegotiationState
	serial string
}

func NewNegotiator(serial string) *Negotiator {
	return &Negotiator{
		state:  StateIdle,
		serial: serial,
	}
}

func (n *Negotiator) State() NegotiationState {
	return n.state
}

func (n *Negotiator) Negotiate(dev *gousb.Device) error {
	dev.ControlTimeout = 5 * time.Second

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(retryBackoff * time.Duration(attempt))
		}

		err := n.negotiateOnce(dev)
		if err == nil {
			return nil
		}

		if attempt == maxRetries {
			n.state = StateFailed
			return fmt.Errorf("AOA negotiation failed after %d attempts: %w", maxRetries+1, err)
		}
	}

	return fmt.Errorf("AOA negotiation failed")
}

func (n *Negotiator) negotiateOnce(dev *gousb.Device) error {
	n.state = StateIdle

	readBuf := make([]byte, 2)
	_, err := dev.Control(0xC0, aoaGetProtocol, 0, 0, readBuf)
	if err != nil {
		return fmt.Errorf("get protocol: %w", err)
	}
	n.state = StateProtocolChecked

	if err := sendIdentString(dev, aoaSendIdent, aoaManufacturer); err != nil {
		return fmt.Errorf("send manufacturer: %w", err)
	}
	if err := sendIdentString(dev, aoaSendIdent+1, aoaModel); err != nil {
		return fmt.Errorf("send model: %w", err)
	}
	if err := sendIdentString(dev, aoaSendIdent+2, aoaVersion); err != nil {
		return fmt.Errorf("send version: %w", err)
	}
	if err := sendIdentString(dev, aoaSendIdent+3, aoaURI); err != nil {
		return fmt.Errorf("send URI: %w", err)
	}
	if n.serial != "" {
		if err := sendIdentString(dev, aoaSendIdent+4, n.serial); err != nil {
			return fmt.Errorf("send serial: %w", err)
		}
	}
	n.state = StateIdentSent

	_, err = dev.Control(controlRequestType, aoaStartAccessory, 0, 0, nil)
	if err != nil {
		return fmt.Errorf("start accessory: %w", err)
	}
	n.state = StateComplete

	return nil
}

func sendIdentString(dev *gousb.Device, index int, value string) error {
	data := []byte(value)
	_, err := dev.Control(controlRequestType, uint8(index), 0, 0, data)
	return err
}
