package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/google/gousb"
	"github.com/smartid/vault6-native-host/aoa"
)

type ShimResult struct {
	Success      bool   `json:"success"`
	Error        string `json:"error,omitempty"`
	VID          int    `json:"vid,omitempty"`
	PID          int    `json:"pid,omitempty"`
	Reenumerated bool   `json:"reenumerated,omitempty"`
}

func main() {
	result := run()
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintf(os.Stderr, "failed to encode result: %v\n", err)
		os.Exit(1)
	}
	if !result.Success {
		os.Exit(1)
	}
}

func run() ShimResult {
	ctx := gousb.NewContext()
	defer ctx.Close()

	discovered, err := aoa.FindAccessoryDevice(ctx, "")
	if err != nil {
		return ShimResult{Success: false, Error: fmt.Sprintf("device discovery failed: %v", err)}
	}

	if discovered == nil {
		return ShimResult{Success: false, Error: "no USB device found"}
	}
	defer discovered.Device.Close()

	if discovered.IsAccessory {
		return ShimResult{
			Success: true,
			VID:     int(discovered.Desc.Vendor),
			PID:     int(discovered.Desc.Product),
		}
	}

	neg := aoa.NewNegotiator(discovered.Serial)
	if negErr := neg.Negotiate(discovered.Device); negErr != nil {
		return ShimResult{Success: false, Error: fmt.Sprintf("AOA negotiation failed: %v", negErr)}
	}

	return ShimResult{
		Success:      true,
		VID:          int(aoa.AccessoryVID),
		PID:          int(aoa.AccessoryPID),
		Reenumerated: true,
	}
}
