package aoa

import (
	"fmt"

	"github.com/google/gousb"
)

type VID gousb.ID
type PID gousb.ID

var KnownVIDs = []gousb.ID{
	0x18D1, // Google
	0x04E8, // Samsung
	0x2A70, // OnePlus
}

const (
	AccessoryVID gousb.ID = 0x18D1
	AccessoryPID gousb.ID = 0x2D01
)

type DiscoveredDevice struct {
	Device     *gousb.Device
	Desc       *gousb.DeviceDesc
	Serial     string
	IsAccessory bool
}

func DiscoverDevices(ctx *gousb.Context, serialFilter string) ([]*DiscoveredDevice, error) {
	devs, err := ctx.OpenDevices(func(desc *gousb.DeviceDesc) bool {
		for _, vid := range KnownVIDs {
			if desc.Vendor == vid {
				return true
			}
		}
		return false
	})
	if err != nil {
		return nil, fmt.Errorf("enumerate USB devices: %w", err)
	}

	var discovered []*DiscoveredDevice
	for _, dev := range devs {
		serial, err := dev.SerialNumber()
		if err != nil {
			serial = ""
		}

		if serialFilter != "" && serial != serialFilter {
			dev.Close()
			continue
		}

		isAccessory := dev.Desc.Vendor == AccessoryVID && dev.Desc.Product == AccessoryPID

		discovered = append(discovered, &DiscoveredDevice{
			Device:      dev,
			Desc:        dev.Desc,
			Serial:      serial,
			IsAccessory: isAccessory,
		})
	}

	return discovered, nil
}

func FindAccessoryDevice(ctx *gousb.Context, serialFilter string) (*DiscoveredDevice, error) {
	devs, err := DiscoverDevices(ctx, serialFilter)
	if err != nil {
		return nil, err
	}

	for _, d := range devs {
		if d.IsAccessory {
			return d, nil
		}
		d.Device.Close()
	}

	return nil, nil
}
