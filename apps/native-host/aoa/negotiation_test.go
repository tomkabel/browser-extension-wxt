package aoa

import (
	"testing"
)

func TestNegotiatorFullStateFlow(t *testing.T) {
	n := NewNegotiator("test-serial-001")

	if n.State() != StateIdle {
		t.Errorf("initial state = %d, want StateIdle", n.State())
	}

	if n.serial != "test-serial-001" {
		t.Errorf("serial = %q, want %q", n.serial, "test-serial-001")
	}
}

func TestNegotiatorWithEmptySerial(t *testing.T) {
	n := NewNegotiator("")

	if n.serial != "" {
		t.Errorf("serial should be empty")
	}
}

func TestNegotiationStateConstants(t *testing.T) {
	states := []struct {
		state NegotiationState
		name  string
		value int
	}{
		{StateIdle, "StateIdle", 0},
		{StateProtocolChecked, "StateProtocolChecked", 1},
		{StateIdentSent, "StateIdentSent", 2},
		{StateAccessoryStarted, "StateAccessoryStarted", 3},
		{StateComplete, "StateComplete", 4},
		{StateFailed, "StateFailed", 5},
	}

	for _, tt := range states {
		t.Run(tt.name, func(t *testing.T) {
			if int(tt.state) != tt.value {
				t.Errorf("%s = %d, want %d", tt.name, tt.state, tt.value)
			}
		})
	}
}

func TestAOAProtocolConstants(t *testing.T) {
	if aoaGetProtocol != 51 {
		t.Errorf("aoaGetProtocol = %d, want 51", aoaGetProtocol)
	}
	if aoaSendIdent != 52 {
		t.Errorf("aoaSendIdent = %d, want 52", aoaSendIdent)
	}
	if aoaStartAccessory != 58 {
		t.Errorf("aoaStartAccessory = %d, want 58", aoaStartAccessory)
	}
	if controlRequestType != 0x40 {
		t.Errorf("controlRequestType = 0x%02X, want 0x40", controlRequestType)
	}
}

func TestAOAIdentificationStrings(t *testing.T) {
	if aoaManufacturer != "SmartIDVault" {
		t.Errorf("manufacturer = %q, want %q", aoaManufacturer, "SmartIDVault")
	}
	if aoaModel != "TetheredProxy" {
		t.Errorf("model = %q, want %q", aoaModel, "TetheredProxy")
	}
	if aoaVersion != "6.0" {
		t.Errorf("version = %q, want %q", aoaVersion, "6.0")
	}
	if aoaURI != "https://smartid-vault.local" {
		t.Errorf("URI = %q, want %q", aoaURI, "https://smartid-vault.local")
	}
}
