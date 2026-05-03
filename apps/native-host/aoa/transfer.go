package aoa

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/gousb"
)

const (
	DefaultTransferTimeout = 5 * time.Second
	MaxTransferSize        = 65536
)

type TransferError struct {
	Kind    TransferErrorKind
	Message string
	Err     error
}

type TransferErrorKind int

const (
	TransferErrTimeout TransferErrorKind = iota
	TransferErrDisconnect
	TransferErrPermanent
)

func (e *TransferError) Error() string {
	return fmt.Sprintf("transfer error (%d): %s: %v", e.Kind, e.Message, e.Err)
}

func classifyError(err error) *TransferError {
	if err == nil {
		return nil
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return &TransferError{
			Kind:    TransferErrTimeout,
			Message: "USB transfer timed out",
			Err:     err,
		}
	}

	errStr := err.Error()
	if errStr == "libusb: transfer timed out" || errStr == "timeout" {
		return &TransferError{
			Kind:    TransferErrTimeout,
			Message: "USB transfer timed out",
			Err:     err,
		}
	}

	if errStr == "libusb: no device" || errStr == "libusb: device not found" {
		return &TransferError{
			Kind:    TransferErrDisconnect,
			Message: "USB device disconnected",
			Err:     err,
		}
	}

	return &TransferError{
		Kind:    TransferErrPermanent,
		Message: "permanent USB error",
		Err:     err,
	}
}

func WriteBulk(ep *gousb.OutEndpoint, data []byte, timeout time.Duration) (int, error) {
	if len(data) > MaxTransferSize {
		return 0, &TransferError{
			Kind:    TransferErrPermanent,
			Message: fmt.Sprintf("payload too large: %d bytes (max %d)", len(data), MaxTransferSize),
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	n, err := ep.WriteContext(ctx, data)
	if err != nil {
		return n, classifyError(err)
	}
	return n, nil
}

func ReadBulk(ep *gousb.InEndpoint, buf []byte, timeout time.Duration) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	n, err := ep.ReadContext(ctx, buf)
	if err != nil {
		return n, classifyError(err)
	}
	return n, nil
}
