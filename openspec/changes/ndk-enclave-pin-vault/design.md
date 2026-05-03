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
- Android Keystore Cipher decryption via JNI into a direct ByteBuffer (native memory, off Java heap)
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
│  JNI call: decryptAndMap(ciphertext, iv, layoutBounds)│
│       │                                               │
│       ▼                                               │
├─────────────────────────────────────────────────────┤
│  C++ NDK ENCLAVE (libvault_enclave.so)                │
│                                                       │
│  1. mlock(pinBuffer, page_size)                       │
│  2. NewDirectByteBuffer(pinBuffer) → directOut        │
│  3. JNI: Cipher.doFinal(ciphertextBB, directOut)      │
│     → Conscrypt/BoringSSL writes plaintext directly   │
│       into mlock'd native buffer (off Java heap)      │
│  4. For each digit in pinBuffer:                      │
│       idx = digit - '0'                               │
│       x = layoutBounds[idx * 2]                       │
│       y = layoutBounds[idx * 2 + 1]                   │
│       coordinates.push(x, y)                          │
│  4. explicit_bzero(pinBuffer, MAX_PIN_SIZE)           │
│  5. munlock(data_page, page_size)                     │
│  6. Return float[] coordinates to Java                │
└─────────────────────────────────────────────────────┘
```

### 2. mlock Allocator

```cpp
class MlockAllocator {
  static constexpr size_t MAX_PIN_SIZE = 32;  // bytes, enough for 6-digit PIN + terminator
  static constexpr size_t GUARD_PAGES = 2;    // PROT_NONE pages before/after

  void* allocate() {
    // Allocate: GUARD_PAGES + 1 data page + GUARD_PAGES; right-align the PIN
    // buffer to the end of the single accessible page so any one-byte overflow
    // hits the next PROT_NONE guard
    size_t total = (GUARD_PAGES * page_size) + page_size + (GUARD_PAGES * page_size);
    uint8_t* mem = static_cast<uint8_t*>(mmap(nullptr, total, PROT_NONE,
                                              MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));
    // Make the single middle page read-write
    uint8_t* data_page = mem + (GUARD_PAGES * page_size);
    mprotect(data_page, page_size, PROT_READ | PROT_WRITE);
    // Lock the full page in RAM
    mlock(data_page, page_size);
    // Right-align PIN buffer to the end of the data page
    uint8_t* pin_buffer = data_page + page_size - MAX_PIN_SIZE;
    // Poison with known pattern to detect use-after-free
    memset(pin_buffer, 0xAA, MAX_PIN_SIZE);
    return pin_buffer;
  }

  void deallocate(void* ptr) {
    // Compute the data page base: PIN buffer starts page_size - MAX_PIN_SIZE bytes from end
    uint8_t* data_page = static_cast<uint8_t*>(ptr) - page_size + MAX_PIN_SIZE;
    uint8_t* mem = data_page - (GUARD_PAGES * page_size);
    size_t total = (GUARD_PAGES * page_size) + page_size + (GUARD_PAGES * page_size);
    explicit_bzero(ptr, MAX_PIN_SIZE);
    munlock(data_page, page_size);
    munmap(mem, total);
  }
};
```

### 3. Keystore JNI Bridge — Direct ByteBuffer Cipher

The PIN decryption path uses a single, stable approach: JNI-call to Java's standard `Cipher.doFinal(ByteBuffer, ByteBuffer)` API with a **direct ByteBuffer** as the output. A direct ByteBuffer is backed by native memory (off the Java heap). Android's Conscrypt provider delegates directly to BoringSSL's `EVP_DecryptUpdate`, which writes the plaintext to the native buffer address — the plaintext **never touches the Java heap**.

This replaces the unstable NDK `AKeyStore` API (not in the NDK stable surface, can break at any Android release). No fallback is needed.

```cpp
status_t decryptPin(JNIEnv* env, const char* keyAlias,
                    const uint8_t* ciphertext, size_t ctLen,
                    const uint8_t* iv, size_t ivLen,
                    uint8_t* plaintext, size_t* ptLen) {
  // 1. Obtain Android Keystore key via JNI:
  //    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
  //    ks.load(null);
  //    Key key = ks.getKey(alias, null);

  // 2. Initialize Cipher:
  //    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
  //    cipher.init(DECRYPT_MODE, key, new GCMParameterSpec(128, iv));

  // 3. Allocate direct ByteBuffer wrapping the mlock'd native buffer
  //    jobject directOut = env->NewDirectByteBuffer(plaintext, *ptLen);
  //    (plaintext pointer is MlockAllocator::allocate()-ed memory)

  // 4. Decrypt directly into the mlock'd native buffer:
  //    jobject inputBB = env->NewDirectByteBuffer(ciphertext, ctLen);
  //    int outLen = cipher.doFinal(inputBB, directOut);
  //    → plaintext written directly to mlock'd native memory
  //    → NEVER enters Java heap

  // 5. On AEADBadTagException: zero the native buffer, return error

  // 6. Return success; C++ proceeds with coordinate mapping on nativeBuf
}
```

The key alias is the PIN identifier (e.g., `"smartid_pin1"` or `"smartid_pin2"`). The key was created during Phase 0 provisioning with `setUserAuthenticationRequired(true)`.

**Why this works**: `Cipher.doFinal(ByteBuffer, ByteBuffer)` is part of the stable `javax.crypto` API since Java 1.4 / Android API 1. When the output is a direct ByteBuffer, Android's Conscrypt provider (which wraps BoringSSL) writes plaintext to the buffer's native address via `EVP_DecryptUpdate`. The Java heap is never involved for the plaintext.

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

- [Risk] `mlock()` requires `CAP_IPC_LOCK` which is unavailable to unprivileged Android apps — The NDK library uses `mlock()` via the system call directly (available to any process that has `mlockall(MCL_CURRENT)` or sufficient RLIMIT_MEMLOCK). Android does not expose a specific permission for `mlock()`; verify `getrlimit(RLIMIT_MEMLOCK)` has sufficient budget. If `mlock()` fails (EFAULT/ENOMEM), fall back to two sequential madvise calls: `madvise(..., MADV_WILLNEED)` then `madvise(..., MADV_DONTDUMP)` with explicit page locking via `mincore()` polling loop
- [Risk] Smart-ID app grid layout changes between versions — PinGridAnalyzer must detect layout version and adjust; use resource ID matching to find the grid container
- [Risk] ~~`AKeyStore` NDK API is not a stable NDK API~~ — **RESOLVED**: The design no longer uses `AKeyStore`. The `Cipher.doFinal(ByteBuffer, ByteBuffer)` path uses only stable, documented javax.crypto APIs. The NDK `AKeyStore_*` path has been removed entirely.
- [Risk] Memory dumps via /proc/pid/mem or LiME — `mlock()` prevents swap but not in-process memory dumping; assume process memory is adversary-controlled, which is why we never store PINs in Java heap
- [Trade-off] JNI overhead of passing layout bounds each session vs caching — Layout bounds change only when Smart-ID app updates; cache them keyed by Smart-ID app version hash
