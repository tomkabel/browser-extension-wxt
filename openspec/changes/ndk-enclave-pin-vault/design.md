## Context

The NDK Memory-Locked Enclave is the Android side's most critical security component. It ensures that Smart-ID PINs never exist in the JVM heap, Binder IPC buffers, or OS swap space. All PIN processing occurs in C++ memory that is:

1. **mlock()'d** — Physically locked in RAM, never swapped to disk
2. **explicit_bzero()'d** — Cryptographically sanitized after use
3. **JNI-isolated** — Plaintext never crosses the JNI boundary; only layout bounds go in, anonymous float coordinates come out

This transforms the PIN from a cryptographic secret into an anonymous spatial gesture. A memory dump of the Android device reveals only X/Y tap coordinates — meaningless without the grid layout context held in Java.

## Goals / Non-Goals

**Goals:**
- C++ shared library (`libvault_enclave.so`) compiled with Android NDK r26+
- `mlock()`-based allocator for PIN buffer (locked, non-swappable memory)
- Android Keystore NDK API caller for direct PIN decryption into locked buffer
- PIN-to-coordinate mapper: decrypted digits → X/Y float pairs using Java-provided layout bounds
- `explicit_bzero()` on all memory release paths including signal handlers and exceptions
- JNI interface: Java passes `float[] layoutBounds`, receives `float[] coordinates`
- Support for both PIN1 (4-6 digits) and PIN2 (5 digits) with variable grid layouts

**Non-Goals:**
- Ghost gesture actuation (covered by `ghost-actuator-gesture-injection`)
- Grid layout analysis (Java layer, covered by Ghost Actuator's `PinGridAnalyzer`)
- Key management for PIN encryption (Android Keystore handles this)
- zkTLS proof verification (Java Orchestrator layer)

## Decisions

### 1. Enclave Memory Architecture

```
┌─────────────────────────────────────────────────────┐
│  JAVA/KOTLIN LAYER                                   │
│                                                       │
│  AndroidKeystore.decrypt() → Ciphertext              │
│  PinGridAnalyzer.analyze() → float[] layoutBounds    │
│                                                       │
│  JNI call: decryptAndMap(ciphertext, layoutBounds)   │
│       │                                               │
│       ▼                                               │
├─────────────────────────────────────────────────────┤
│  C++ NDK ENCLAVE (libvault_enclave.so)                │
│                                                       │
│  1. mlock(pinBuffer, MAX_PIN_SIZE)                    │
│  2. AKeyStore_decryptBlob() → plaintext PIN           │
│     into pinBuffer                                    │
│  3. For each digit in pinBuffer:                      │
│       idx = digit - '0'                               │
│       x = layoutBounds[idx * 2]                       │
│       y = layoutBounds[idx * 2 + 1]                   │
│       coordinates.push(x, y)                          │
│  4. explicit_bzero(pinBuffer, MAX_PIN_SIZE)           │
│  5. munlock(pinBuffer, MAX_PIN_SIZE)                  │
│  6. Return float[] coordinates to Java                │
└─────────────────────────────────────────────────────┘
```

### 2. mlock Allocator

```cpp
class MlockAllocator {
  static constexpr size_t MAX_PIN_SIZE = 32;  // bytes, enough for 6-digit PIN + terminator
  static constexpr size_t GUARD_PAGES = 2;    // PROT_NONE pages before/after

  void* allocate() {
    // Allocate with guard pages to detect overflow
    size_t total = (GUARD_PAGES * page_size) + MAX_PIN_SIZE + (GUARD_PAGES * page_size);
    uint8_t* mem = static_cast<uint8_t*>(mmap(nullptr, total, PROT_NONE,
                                              MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));
    // Make the middle region read-write
    mprotect(mem + (GUARD_PAGES * page_size), MAX_PIN_SIZE, PROT_READ | PROT_WRITE);
    // Lock in RAM
    mlock(mem + (GUARD_PAGES * page_size), MAX_PIN_SIZE);
    // Poison with known pattern to detect use-after-free
    memset(mem + (GUARD_PAGES * page_size), 0xAA, MAX_PIN_SIZE);
    return mem + (GUARD_PAGES * page_size);
  }

  void deallocate(void* ptr) {
    uint8_t* mem = static_cast<uint8_t*>(ptr) - (GUARD_PAGES * page_size);
    size_t total = (GUARD_PAGES * page_size) + MAX_PIN_SIZE + (GUARD_PAGES * page_size);
    explicit_bzero(ptr, MAX_PIN_SIZE);
    munlock(ptr, MAX_PIN_SIZE);
    munmap(mem, total);
  }
};
```

### 3. Keystore NDK Bridge

Android Keystore decryption via NDK uses `AKeyStore` API (API level 28+):

```cpp
status_t decryptPin(AKeystore* keystore, const char* keyAlias,
                    const uint8_t* ciphertext, size_t ctLen,
                    uint8_t* plaintext, size_t* ptLen) {
  // 1. Get key characteristics (verify user authentication required)
  // 2. Create decryption builder with AES/GCM/NoPadding
  // 3. Set auth timeout to 0 (require biometric each time)
  // 4. Decrypt directly into mlocked buffer
  // 5. Return status
}
```

The key alias is the PIN identifier (e.g., `"smartid_pin1"` or `"smartid_pin2"`). The key was created during Phase 0 provisioning with `setUserAuthenticationRequired(true)`.

### 4. PIN-to-Coordinate Mapping

The Java layer calculates the Smart-ID app's PIN grid button positions using Accessibility node bounds:

```
Layout bounds input format (Java → C++):
float[] layoutBounds = {
  x0, y0,  // center of digit '1' button
  x1, y1,  // center of digit '2' button
  ...       // up to digit '9', then '0'
}

Coordinate mapping (C++):
for each character c in decrypted PIN:
  if c >= '1' && c <= '9':
    idx = c - '1'
  else if c == '0':
    idx = 9
  x = layoutBounds[idx * 2]
  y = layoutBounds[idx * 2 + 1]
  output.push(x, y)
```

The output `float[]` coordinates are returned to Java. The Java Orchestrator passes these to the Ghost Actuator, which constructs `GestureDescription.StrokeDescription` objects for each coordinate pair.

### 5. Memory Sanitization

`explicit_bzero()` is implemented as a volatile function pointer call to prevent compiler optimization:

```cpp
// Volatile function pointer prevents dead-store elimination
static void (*volatile bzero_ptr)(void*, size_t) = &bzero;

void secure_zero(void* ptr, size_t size) {
  if (ptr) {
    bzero_ptr(ptr, size);
    // Memory barrier to ensure zeroing completes before return
    std::atomic_signal_fence(std::memory_order_seq_cst);
  }
}
```

The sanitizer is called on all code paths:
- Normal completion (after coordinate generation)
- Error/exception (Keystore failure, invalid bounds)
- Signal handler (SIGSEGV, SIGTERM)
- JNI crash (via `JNI_OnLoad` error handling)

## Risks / Trade-offs

- [Risk] `mlock()` requires `android.permission.MANAGE_OWN_ANDROID_KEYS` — Verify this is available on Android 13+; fall back to `madvise(MADV_WILLNEED)` if unavailable
- [Risk] Smart-ID app grid layout changes between versions — PinGridAnalyzer must detect layout version and adjust; use resource ID matching to find the grid container
- [Risk] `AKeyStore` NDK API is not well-documented — Rely on Android Keystore Java API via JNI if NDK API is unstable; decrypt in Java but zero immediately after JNI transfer to C++
- [Risk] Memory dumps via /proc/pid/mem or LiME — `mlock()` prevents swap but not in-process memory dumping; assume process memory is adversary-controlled, which is why we never store PINs in Java heap
- [Trade-off] JNI overhead of passing layout bounds each session vs caching — Layout bounds change only when Smart-ID app updates; cache them keyed by Smart-ID app version hash
