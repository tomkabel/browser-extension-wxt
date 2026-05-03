package aoa

import (
	"context"
	"fmt"
	"time"

	"github.com/google/gousb"
)

type HotplugEvent struct {
	Type   HotplugEventType
	Device *DiscoveredDevice
}

type HotplugEventType int

const (
	HotplugConnect HotplugEventType = iota
	HotplugDisconnect
)

type HotplugCallback func(event HotplugEvent)

type HotplugMonitor struct {
	ctx       *gousb.Context
	serial    string
	pollInterval time.Duration
	callback  HotplugCallback
	cancel    context.CancelFunc
}

func NewHotplugMonitor(ctx *gousb.Context, serial string, interval time.Duration, cb HotplugCallback) *HotplugMonitor {
	return &HotplugMonitor{
		ctx:          ctx,
		serial:       serial,
		pollInterval: interval,
		callback:     cb,
	}
}

func (hm *HotplugMonitor) Start(ctx context.Context) {
	ctx, hm.cancel = context.WithCancel(ctx)

	go hm.poll(ctx)
}

func (hm *HotplugMonitor) Stop() {
	if hm.cancel != nil {
		hm.cancel()
	}
}

func (hm *HotplugMonitor) poll(ctx context.Context) {
	var wasConnected bool
	ticker := time.NewTicker(hm.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			dev, err := FindAccessoryDevice(hm.ctx, hm.serial)
			if err != nil {
				continue
			}

			isConnected := dev != nil

			if isConnected && !wasConnected {
				hm.callback(HotplugEvent{
					Type:   HotplugConnect,
					Device: dev,
				})
			} else if !isConnected && wasConnected {
				hm.callback(HotplugEvent{
					Type: HotplugDisconnect,
				})
			} else if isConnected && dev != nil {
				dev.Device.Close()
			}

			wasConnected = isConnected
		}
	}
}

func (hm *HotplugMonitor) WaitForDevice(ctx context.Context) (*DiscoveredDevice, error) {
	ticker := time.NewTicker(hm.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("context cancelled while waiting for device")
		case <-ticker.C:
			dev, err := FindAccessoryDevice(hm.ctx, hm.serial)
			if err != nil {
				continue
			}
			if dev != nil {
				return dev, nil
			}
		}
	}
}
