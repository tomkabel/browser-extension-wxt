package aoa

import (
	"testing"

	"github.com/google/gousb"
)

func TestKnownVIDsContainsGoogle(t *testing.T) {
	found := false
	for _, vid := range KnownVIDs {
		if vid == 0x18D1 {
			found = true
			break
		}
	}
	if !found {
		t.Error("KnownVIDs should contain Google VID 0x18D1")
	}
}

func TestKnownVIDsContainsSamsung(t *testing.T) {
	found := false
	for _, vid := range KnownVIDs {
		if vid == 0x04E8 {
			found = true
			break
		}
	}
	if !found {
		t.Error("KnownVIDs should contain Samsung VID 0x04E8")
	}
}

func TestKnownVIDsContainsOnePlus(t *testing.T) {
	found := false
	for _, vid := range KnownVIDs {
		if vid == 0x2A70 {
			found = true
			break
		}
	}
	if !found {
		t.Error("KnownVIDs should contain OnePlus VID 0x2A70")
	}
}

func TestAccessoryConstants(t *testing.T) {
	if AccessoryVID != 0x18D1 {
		t.Errorf("AccessoryVID = 0x%04X, want 0x18D1", AccessoryVID)
	}
	if AccessoryPID != 0x2D01 {
		t.Errorf("AccessoryPID = 0x%04X, want 0x2D01", AccessoryPID)
	}
}

func TestNegotiatorInitialState(t *testing.T) {
	n := NewNegotiator("test-serial")
	if n.State() != StateIdle {
		t.Errorf("initial state = %d, want StateIdle (%d)", n.State(), StateIdle)
	}
}

func TestNegotiatorStateTransitions(t *testing.T) {
	n := NewNegotiator("")

	if n.State() != StateIdle {
		t.Errorf("expected StateIdle, got %d", n.State())
	}
}

func TestTransferErrorClassification(t *testing.T) {
	tests := []struct {
		name     string
		errStr   string
		wantKind TransferErrorKind
	}{
		{"timeout", "libusb: transfer timed out", TransferErrTimeout},
		{"disconnect", "libusb: no device", TransferErrDisconnect},
		{"permanent", "some other error", TransferErrPermanent},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			te := classifyError(&testError{tt.errStr})
			if te.Kind != tt.wantKind {
				t.Errorf("classifyError(%q) kind = %d, want %d", tt.errStr, te.Kind, tt.wantKind)
			}
		})
	}
}

func TestTransferSizeLimit(t *testing.T) {
	if MaxTransferSize != 65536 {
		t.Errorf("MaxTransferSize = %d, want 65536", MaxTransferSize)
	}
}

func TestEndpointConstants(t *testing.T) {
	if EndpointOUTNum != 1 {
		t.Errorf("EndpointOUTNum = %d, want 1", EndpointOUTNum)
	}
	if EndpointINNum != 1 {
		t.Errorf("EndpointINNum = %d, want 1", EndpointINNum)
	}
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

func TestDiscoverDevicesNoUSB(t *testing.T) {
	ctx := gousb.NewContext()
	defer ctx.Close()

	devs, err := DiscoverDevices(ctx, "")
	if err != nil {
		t.Fatalf("DiscoverDevices failed: %v", err)
	}

	for _, d := range devs {
		d.Device.Close()
	}
}

func TestFindAccessoryDeviceNoneFound(t *testing.T) {
	ctx := gousb.NewContext()
	defer ctx.Close()

	dev, err := FindAccessoryDevice(ctx, "nonexistent-serial-12345")
	if err != nil {
		t.Fatalf("FindAccessoryDevice failed: %v", err)
	}
	if dev != nil {
		dev.Device.Close()
		t.Error("expected no device for nonexistent serial")
	}
}
