#!/usr/bin/env bash
# Wrapper around `zig cc` for use as CC in Go CGO cross-compilation.
# Usage: zig-cc.sh <target> [cc-args...]
# Example: zig-cc.sh x86_64-linux-gnu -o foo.o foo.c

set -euo pipefail

TARGET="${1:?Usage: zig-cc.sh <target> [cc-args...]}"
shift

exec zig cc -target "$TARGET" "$@"
