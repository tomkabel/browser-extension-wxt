package aoa

import (
	"fmt"

	"github.com/google/gousb"
)

const (
	EndpointOUTNum = 1
	EndpointINNum  = 1
)

type AoaDevice struct {
	dev      *gousb.Device
	iface    *gousb.Interface
	epOut    *gousb.OutEndpoint
	epIn     *gousb.InEndpoint
	cleanups []func()
}

func OpenAoaDevice(dev *gousb.Device) (*AoaDevice, error) {
	aoa := &AoaDevice{dev: dev}

	cfg, err := dev.Config(1)
	if err != nil {
		return nil, fmt.Errorf("get config: %w", err)
	}
	aoa.cleanups = append(aoa.cleanups, func() { cfg.Close() })

	var ifaceNum int
	var altNum int
	var found bool
	for _, id := range cfg.Desc.Interfaces {
		for _, alt := range id.AltSettings {
			hasOUT := false
			hasIN := false
			for addr := range alt.Endpoints {
				if addr == gousb.EndpointAddress(EndpointOUTNum) {
					hasOUT = true
				}
				if addr == gousb.EndpointAddress(0x80|EndpointINNum) {
					hasIN = true
				}
			}
			if hasOUT && hasIN {
				ifaceNum = id.Number
				altNum = alt.Number
				found = true
				break
			}
		}
		if found {
			break
		}
	}

	if !found {
		aoa.Close()
		return nil, fmt.Errorf("accessory interface with endpoints 0x01/0x81 not found")
	}

	intf, err := cfg.Interface(ifaceNum, altNum)
	if err != nil {
		aoa.Close()
		return nil, fmt.Errorf("claim interface %d alt %d: %w", ifaceNum, altNum, err)
	}
	aoa.iface = intf
	aoa.cleanups = append(aoa.cleanups, func() { intf.Close() })

	epOut, err := intf.OutEndpoint(EndpointOUTNum)
	if err != nil {
		aoa.Close()
		return nil, fmt.Errorf("open OUT endpoint: %w", err)
	}
	aoa.epOut = epOut

	epIn, err := intf.InEndpoint(EndpointINNum)
	if err != nil {
		aoa.Close()
		return nil, fmt.Errorf("open IN endpoint: %w", err)
	}
	aoa.epIn = epIn

	return aoa, nil
}

func (a *AoaDevice) OutEndpoint() *gousb.OutEndpoint {
	return a.epOut
}

func (a *AoaDevice) InEndpoint() *gousb.InEndpoint {
	return a.epIn
}

func (a *AoaDevice) Close() error {
	for i := len(a.cleanups) - 1; i >= 0; i-- {
		a.cleanups[i]()
	}
	return a.dev.Close()
}
