package main

import (
	"encoding/json"
	"testing"
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
		{
			name:   "success with reenumeration flag",
			result: ShimResult{Success: true, VID: 0x18D1, PID: 0x2D01, Reenumerated: true},
			want:   `{"success":true,"vid":6353,"pid":11521,"reenumerated":true}`,
		},
		{
			name:   "reenumerated false is omitted",
			result: ShimResult{Success: true, VID: 0x18D1, PID: 0x2D01, Reenumerated: false},
			want:   `{"success":true,"vid":6353,"pid":11521}`,
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
	tests := []struct {
		name        string
		input       string
		wantSuccess bool
		wantVID     int
		wantPID     int
		wantReenum  bool
	}{
		{
			name:        "basic success",
			input:       `{"success":true,"vid":6353,"pid":11521}`,
			wantSuccess: true,
			wantVID:     0x18D1,
			wantPID:     0x2D01,
		},
		{
			name:        "success with reenumeration",
			input:       `{"success":true,"vid":6353,"pid":11521,"reenumerated":true}`,
			wantSuccess: true,
			wantVID:     0x18D1,
			wantPID:     0x2D01,
			wantReenum:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var result ShimResult
			if err := json.Unmarshal([]byte(tt.input), &result); err != nil {
				t.Fatalf("json.Unmarshal failed: %v", err)
			}
			if result.Success != tt.wantSuccess {
				t.Errorf("Success = %v, want %v", result.Success, tt.wantSuccess)
			}
			if result.VID != tt.wantVID {
				t.Errorf("VID = 0x%04X, want 0x%04X", result.VID, tt.wantVID)
			}
			if result.PID != tt.wantPID {
				t.Errorf("PID = 0x%04X, want 0x%04X", result.PID, tt.wantPID)
			}
			if result.Reenumerated != tt.wantReenum {
				t.Errorf("Reenumerated = %v, want %v", result.Reenumerated, tt.wantReenum)
			}
		})
	}
}
