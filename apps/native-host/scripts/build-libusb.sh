#!/usr/bin/env bash
set -euo pipefail

LIBUSB_VERSION="${LIBUSB_VERSION:-1.0.27}"
LIBUSB_URL="https://github.com/libusb/libusb/releases/download/v${LIBUSB_VERSION}/libusb-${LIBUSB_VERSION}.tar.bz2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/../deps"
SRC_DIR="/tmp/libusb-${LIBUSB_VERSION}"

download_libusb() {
  if [ -d "$SRC_DIR" ]; then
    echo "libusb source already exists at $SRC_DIR"
    return
  fi
  echo "Downloading libusb ${LIBUSB_VERSION}..."
  curl -sL "$LIBUSB_URL" | tar xj -C /tmp
}

generate_config_h() {
  local target="$1"
  local config_dir="/tmp/libusb-config-${target}"
  mkdir -p "$config_dir"

  case "$target" in
    *linux*)
      cat > "$config_dir/config.h" <<'CONF'
#define _GNU_SOURCE 1
#define PLATFORM_POSIX 1
#define HAVE_CLOCK_GETTIME 1
#define HAVE_EVENTFD 1
#define HAVE_TIMERFD 1
#define HAVE_PIPE2 1
#define HAVE_SYS_TIME_H 1
#define HAVE_STRUCT_TIMESPEC 1
#define HAVE_NFDS_T 1
#define HAVE_SYSLOG_H 1
#define DEFAULT_VISIBILITY __attribute__((visibility("default")))
#define PACKAGE_NAME "libusb"
#define PACKAGE_STRING "libusb 1.0.27"
#define PACKAGE_VERSION "1.0.27"
#define PACKAGE_BUGREPORT ""
#define PACKAGE_URL "https://libusb.info"
CONF
      ;;
    *macos*)
      cat > "$config_dir/config.h" <<'CONF'
#define PLATFORM_POSIX 1
#define HAVE_CLOCK_GETTIME 1
#define HAVE_SYS_TIME_H 1
#define HAVE_STRUCT_TIMESPEC 1
#define HAVE_NFDS_T 1
#define DEFAULT_VISIBILITY __attribute__((visibility("default")))
#define PACKAGE_NAME "libusb"
#define PACKAGE_STRING "libusb 1.0.27"
#define PACKAGE_VERSION "1.0.27"
#define PACKAGE_BUGREPORT ""
#define PACKAGE_URL "https://libusb.info"
CONF
      ;;
    *windows*)
      cat > "$config_dir/config.h" <<'CONF'
#define PLATFORM_WINDOWS 1
#define DEFAULT_VISIBILITY
#define PACKAGE_NAME "libusb"
#define PACKAGE_STRING "libusb 1.0.27"
#define PACKAGE_VERSION "1.0.27"
#define PACKAGE_BUGREPORT ""
#define PACKAGE_URL "https://libusb.info"
CONF
      ;;
  esac

  echo "$config_dir/config.h"
}

build_static_lib() {
  local target="$1"
  shift
  local extra_srcs=("$@")
  local out_dir="${DEPS_DIR}/${target}"
  local obj_dir="/tmp/libusb-obj-${target}"
  local lib_dir="${out_dir}/lib"
  local inc_dir="${out_dir}/include/libusb-1.0"

  echo "=== Building libusb for ${target} ==="

  local config_h
  config_h=$(generate_config_h "$target")

  rm -rf "$obj_dir"
  mkdir -p "$obj_dir" "$lib_dir" "$inc_dir"

  local cflags="-O2 -fPIC -Wall"
  cflags="$cflags -I${SRC_DIR}/libusb"
  cflags="$cflags -I$(dirname "$config_h")"

  local all_srcs=("${SRC_DIR}/libusb/core.c"
    "${SRC_DIR}/libusb/descriptor.c"
    "${SRC_DIR}/libusb/hotplug.c"
    "${SRC_DIR}/libusb/io.c"
    "${SRC_DIR}/libusb/strerror.c"
    "${SRC_DIR}/libusb/sync.c"
    "${extra_srcs[@]}")

  local obj_files=()

  for src in "${all_srcs[@]}"; do
    local base
    base=$(basename "$src" .c)
    local obj="${obj_dir}/${base}.o"

    echo "  CC $(basename "$src")"
    if ! zig cc -target "$target" $cflags -c "$src" -o "$obj" 2>&1; then
      echo "  FAILED: $(basename "$src")"
      return 1
    fi
    obj_files+=("$obj")
  done

  local lib_file="${lib_dir}/libusb-1.0.a"
  echo "  AR libusb-1.0.a"
  rm -f "$lib_file"
  zig ar rcs "$lib_file" "${obj_files[@]}"

  cp "${SRC_DIR}/libusb/libusb.h" "$inc_dir/"
  [ -f "${SRC_DIR}/libusb/version.h" ] && cp "${SRC_DIR}/libusb/version.h" "$inc_dir/"

  rm -rf "$obj_dir"
  echo "  => ${lib_file} ($(du -h "$lib_file" | cut -f1))"
}

generate_pkgconfig() {
  local target="$1"
  local out_dir="${DEPS_DIR}/${target}"
  local pc_dir="${out_dir}/lib/pkgconfig"

  mkdir -p "$pc_dir"
  cat > "$pc_dir/libusb-1.0.pc" <<EOF
prefix=${out_dir}
exec_prefix=\${prefix}
libdir=\${exec_prefix}/lib
includedir=\${prefix}/include/libusb-1.0

Name: libusb-1.0
Description: USB access library
Version: ${LIBUSB_VERSION}
Libs: -L\${libdir} -lusb-1.0
Cflags: -I\${includedir}
EOF
}

main() {
  download_libusb

  build_static_lib "x86_64-linux-gnu" \
    "$SRC_DIR/libusb/os/events_posix.c" \
    "$SRC_DIR/libusb/os/linux_netlink.c" \
    "$SRC_DIR/libusb/os/linux_usbfs.c" \
    "$SRC_DIR/libusb/os/threads_posix.c"
  generate_pkgconfig "x86_64-linux-gnu"

  build_static_lib "aarch64-linux-gnu" \
    "$SRC_DIR/libusb/os/events_posix.c" \
    "$SRC_DIR/libusb/os/linux_netlink.c" \
    "$SRC_DIR/libusb/os/linux_usbfs.c" \
    "$SRC_DIR/libusb/os/threads_posix.c"
  generate_pkgconfig "aarch64-linux-gnu"

  if [ -d "/usr/lib/sdk/MacOSX.sdk" ] || [ -n "${MACOS_SDK_PATH:-}" ]; then
    build_static_lib "x86_64-macos-none" \
      "$SRC_DIR/libusb/os/events_posix.c" \
      "$SRC_DIR/libusb/os/darwin_usb.c" \
      "$SRC_DIR/libusb/os/threads_posix.c"
    generate_pkgconfig "x86_64-macos-none"

    build_static_lib "aarch64-macos-none" \
      "$SRC_DIR/libusb/os/events_posix.c" \
      "$SRC_DIR/libusb/os/darwin_usb.c" \
      "$SRC_DIR/libusb/os/threads_posix.c"
    generate_pkgconfig "aarch64-macos-none"
  else
    echo "=== Skipping macOS targets (Apple SDK not found) ==="
    echo "  Install the macOS SDK or set MACOS_SDK_PATH to build for macOS."
  fi

  build_static_lib "x86_64-windows-gnu" \
    "$SRC_DIR/libusb/os/events_windows.c" \
    "$SRC_DIR/libusb/os/windows_common.c" \
    "$SRC_DIR/libusb/os/windows_winusb.c" \
    "$SRC_DIR/libusb/os/windows_usbdk.c" \
    "$SRC_DIR/libusb/os/threads_windows.c"
  generate_pkgconfig "x86_64-windows-gnu"

  echo ""
  echo "=== All libusb builds complete ==="
  for d in "${DEPS_DIR}"/*/; do
    local t
    t=$(basename "$d")
    local lib="$d/lib/libusb-1.0.a"
    if [ -f "$lib" ]; then
      echo "  OK ${t}: $(du -h "$lib" | cut -f1)"
    else
      echo "  FAIL ${t}: MISSING"
    fi
  done
}

main "$@"
