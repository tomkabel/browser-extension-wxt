## Why

The single greatest security vulnerability in automating Smart-ID is PIN exposure. If a root-level malware on the Android device can read the PIN from JVM heap, Binder IPC buffers, or memory dumps, the entire security model collapses. V6 solves this by processing PINs entirely in a C++ NDK enclave that:

1. Allocates memory with `mlock()` to prevent OS swapping to disk
2. Decrypts PINs directly from Android Keystore into the locked buffer (never passes through JVM)
3. Maps decrypted PIN digits to anonymous X/Y screen coordinates
4. Obliterates the buffer with `explicit_bzero()` immediately after use

The JVM never possesses the plaintext PIN string. It only receives anonymous `float[x, y]` coordinate pairs. This transforms cryptographic secrets into meaningless spatial data — an Android memory dump reveals only tap coordinates, not PIN digits.

## What Changes

- **`libvault_enclave.so`**: C++ shared library compiled with the Android NDK. Contains:
  - `mlock` memory allocator for PIN buffer
  - Keystore JNI bridge using Cipher.doFinal with direct ByteBuffer for PIN decryption (off-heap)
  - PIN-to-coordinate mapper (receives Java layout bounds, maps decrypted digits to X/Y)
  - `explicit_bzero` memory sanitizer
- **JNI Bridge**: Java/Kotlin layer that:
  - Calculates Smart-ID app PIN grid bounding boxes from Accessibility node info
  - Passes layout bounds to C++ enclave via JNI
  - Receives `float[x, y][]` coordinate array
  - Never stores or logs the returned coordinates
- **Android Keystore PIN Storage**: PINs are encrypted with `KeyGenParameterSpec` requiring:
  - `setUserAuthenticationRequired(true)` — biometric before decryption
  - `setUnlockedDeviceRequirement(true)` — device must be unlocked
  - AES/GCM/NoPadding cipher
- **Memory Lifecycle Manager**: Ensures `mlock`/`munlock` pairing, buffer zeroing on all code paths (success, error, exception), and protection against memory-dump DFIR tools.

## Capabilities

### New Capabilities

- `ndk-mlock-allocator`: C++ memory allocator that uses `mlock()` for physical RAM locking, preventing swap-based PIN leakage
- `keystore-ndk-bridge`: JNI-call to Java Cipher.doFinal(ByteBuffer, ByteBuffer) with direct ByteBuffer output — decrypted plaintext written directly to mlock'd native memory, never touches Java heap
- `pin-to-coordinate-mapper`: Algorithm that maps decrypted PIN digit string to X/Y float coordinates based on Java-provided grid layout bounds
- `explicit-bzero-sanitizer`: Memory zeroing on all exit paths including信号 handlers, exceptions, and JNI crashes
- `jni-pin-bridge`: Java ↔ C++ JNI interface that passes layout bounds in, receives float coordinates out

### Modified Capabilities

- Existing `a11y-bridge` accessibility service: gains a new "enclave mode" that uses coordinate-based dispatchGesture instead of semantic Accessibility actions
- `android-companion-app`: The vault module evolves from a credential storage to the NDK enclave container

## Impact

- **New project**: `apps/android-vault/` — Android native library project with `libvault_enclave/` (C++ NDK) and `enclave-bridge/` (Java/Kotlin JNI wrapper)
- **Smart-ID Companion app**: Integrates `libvault_enclave.so` via JNI. The `GhostActuator` module calls the enclave for PIN processing.
- **Security**: Memory dumps (fmem, LiME) will not reveal PINs. JVM heap dumps show no plaintext secrets. The only observable data is anonymous touch coordinates.
- **Build**: CMakeLists.txt for NDK build. Requires Android NDK r26+, API level 33+.
- **Testing**: Unit tests for coordinate mapping; integration tests with mock Keystore; memory leak detection via AddressSanitizer.

## V6 Alignment

PHASE 2 — Critical V6 capability. This is the Layer 3 defense that eliminates PIN extraction via memory dump. It is the enabler for the Ghost Actuator's blind gesture injection. Without this enclave, the V6 security model cannot achieve "Architecturally Eliminated" status for Android memory dump attacks.

## Dependencies

- Blocking: [`ghost-actuator-gesture-injection`](#) (enclave produces the anonymous coordinate inputs that the actuator requires; the actuator is blocked on this change)
- Blocking: `eidas-qes-hardware-gate` (needs enclave for PIN2 handling)
- Builds on: `usb-aoa-transport-proxy` (completed — transport for the verified payload that authorizes PIN decryption)
