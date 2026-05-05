package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestShimResultJSON(t *testing.T) {
	tests := []struct {
		name   string
		result ShimResult
		want   string
	}{
		{
			name:   "success",
			result: ShimResult{Success: true, VID: 0x18D1, PID: 0x2D01},
			want:   `{"success":true,"vid":6353,"pid":11521}`,
		},
		{
			name:   "failure",
			result: ShimResult{Success: false, Error: "no USB device found"},
			want:   `{"success":false,"error":"no USB device found"}`,
		},
		{
			name:   "success with zero VID/PID omitted",
			result: ShimResult{Success: true},
			want:   `{"success":true}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.result)
			if err != nil {
				t.Fatalf("json.Marshal failed: %v", err)
			}
			if string(data) != tt.want {
				t.Errorf("json.Marshal = %s, want %s", string(data), tt.want)
			}
		})
	}
}

func TestShimResultUnmarshal(t *testing.T) {
	input := `{"success":true,"vid":6353,"pid":11521}`
	var result ShimResult
	if err := json.Unmarshal([]byte(input), &result); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if result.VID != 0x18D1 {
		t.Errorf("VID = 0x%04X, want 0x18D1", result.VID)
	}
	if result.PID != 0x2D01 {
		t.Errorf("PID = 0x%04X, want 0x2D01", result.PID)
	}
}

func TestAoaReEnumerateWaitConstant(t *testing.T) {
	if aoaReEnumerateWait != 2*time.Second {
		t.Errorf("aoaReEnumerateWait = %v, want 2s", aoaReEnumerateWait)
	}
}
