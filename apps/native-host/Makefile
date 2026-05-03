APP_NAME := smartid-aoa-host
MODULE := github.com/smartid/vault6-native-host
BUILD_DIR := build
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -s -w -X main.version=$(VERSION)
PROJECT_ROOT := $(shell pwd)

.PHONY: all build build-all build-deps test lint clean release

all: build

build:
	CGO_ENABLED=1 go build -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) .

build-deps:
	./scripts/build-libusb.sh

build-all: build-deps
	GORELEASER_PROJECT_ROOT=$(PROJECT_ROOT) goreleaser build --snapshot --clean

release:
	GORELEASER_PROJECT_ROOT=$(PROJECT_ROOT) goreleaser release --clean

test:
	go test -v -race ./...

lint:
	go vet ./...

clean:
	rm -rf $(BUILD_DIR) deps/ dist/
