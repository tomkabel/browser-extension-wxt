## 1. C++ NDK Library Scaffolding

- [ ] 1.1 Create `apps/android-vault/libvault_enclave/` NDK project with `CMakeLists.txt`, target API level 33+, NDK r26+
- [ ] 1.2 Configure Android Studio Gradle integration for native library build
- [ ] 1.3 Implement basic JNI bridge: Java `native decryptAndMap(ciphertext, layoutBounds)` → C++ → returns `float[]`
- [ ] 1.4 Set up AddressSanitizer build variant for memory safety testing
- [ ] 1.5 Unit test: JNI bridge compiles and links correctly; no unresolved symbols

## 2. mlock Allocator

- [ ] 2.1 Implement `MlockAllocator` in C++: `allocate()` uses `mmap()` with PROT_NONE guard pages (2 pages before, 2 pages after), `mprotect()` for middle region, `mlock()` for RAM locking
- [ ] 2.2 Implement `deallocate()`: `explicit_bzero()` on data, `munlock()`, `munmap()` full region including guard pages
- [ ] 2.3 Implement `RLIMIT_MEMLOCK` budget check: verify `getrlimit(RLIMIT_MEMLOCK)` has sufficient budget before `mlock()`; log warning if inadequate
- [ ] 2.4 Implement fallback: if `mlock()` fails, use two sequential madvise calls — `madvise(..., MADV_WILLNEED)` then `madvise(..., MADV_DONTDUMP)` — with `mincore()` polling loop
- [ ] 2.5 Poison allocated memory with `0xAA` pattern to detect use-after-free
- [ ] 2.6 Unit test: allocation/deallocation roundtrip does not leak memory
- [ ] 2.7 Unit test: guard page access triggers SIGSEGV (verified in test harness)
- [ ] 2.8 Unit test: `mlock`-ed memory is not swappable (verify via `/proc/self/status VmSwap`)

## 3. Keystore JNI Bridge — Direct ByteBuffer Cipher

- [ ] 3.1 Implement `decryptPin()` in C++: obtain Android Keystore key via JNI (`KeyStore.getInstance("AndroidKeyStore").getKey(alias, null)`)
- [ ] 3.2 Implement `Cipher` initialization via JNI: `Cipher.getInstance("AES/GCM/NoPadding")`, `cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))`
- [ ] 3.3 Create direct ByteBuffer wrapping the mlock'd native buffer via `NewDirectByteBuffer(pinBuffer, MAX_PIN_SIZE)`
- [ ] 3.4 Call `Cipher.doFinal(ByteBuffer ciphertextInput, ByteBuffer directOutput)` — plaintext lands in mlock'd native buffer (off Java heap)
- [ ] 3.5 Handle decryption failure (`AEADBadTagException`): zero the native buffer, return error code, do NOT throw exception through JNI
- [ ] 3.6 Unit test: decryption with valid key alias returns correct PIN
- [ ] 3.7 Unit test: decryption with invalid key alias / tampered ciphertext returns error
- [ ] 3.8 Integration test: Java `Cipher` encrypt → JNI `Cipher.doFinal(ByteBuffer, ByteBuffer)` decrypt produces same plaintext
- [ ] 3.9 Integration test: verify decrypted plaintext never appears in Java heap dump (scan with jmap or Android Studio Memory Profiler)

## 4. PIN-to-Coordinate Mapper

- [ ] 4.1 Implement coordinate mapping: for each digit character in decrypted PIN, compute `idx = (c >= '1' && c <= '9') ? c - '1' : 9` for digit '0', look up `(layoutBounds[idx*2], layoutBounds[idx*2+1])`
- [ ] 4.2 Handle variable PIN lengths: 4-6 digits for PIN1, 5 digits for PIN2
- [ ] 4.3 Validate layout bounds array: must have exactly 20 entries (10 digit positions × 2 coordinates)
- [ ] 4.4 Unit test: PIN "12345" maps to correct coordinates for a given layout
- [ ] 4.5 Unit test: PIN containing '0' maps to index 9 correctly
- [ ] 4.6 Unit test: invalid digit character returns error

## 5. Memory Sanitization

- [ ] 5.1 Implement `secure_zero()`: volatile function pointer to `bzero` to prevent dead-store elimination
- [ ] 5.2 Add `std::atomic_signal_fence(std::memory_order_seq_cst)` after zeroing for memory barrier
- [ ] 5.3 Call `secure_zero()` on all exit paths: normal completion, error/exception, signal handler (SIGSEGV, SIGTERM), JNI crash
- [ ] 5.4 Unit test: buffer is actually zeroed after `secure_zero()` call (verify with memory inspection)
- [ ] 5.5 Unit test: compiler does not optimize away the zeroing (verify in release build with objdump)

## 6. Java/Kotlin JNI Bridge

- [ ] 6.1 Implement `EnclaveBridge.kt`: Java native method `decryptAndMap(ciphertext: ByteArray, layoutBounds: FloatArray): FloatArray`
- [ ] 6.2 Never store returned `float[]` coordinates in Kotlin variables longer than necessary; pass directly to GhostActuator
- [ ] 6.3 Handle `SecurityException` from biometric gate: catch, return empty coordinates, log audit event
- [ ] 6.4 Unit test: JNI call with valid inputs returns correctly sized `float[]`

## 7. Integration & Testing

- [ ] 7.1 Integration test: end-to-end PIN decryption with mock Keystore: encrypt → store → decrypt via NDK → coordinate mapping → output
- [ ] 7.2 Integration test: memory leak detection via AddressSanitizer (run full test suite with `-fsanitize=address`)
- [ ] 7.3 Integration test: verify JVM heap has no PIN plaintext after enclave operation (scan heap dump)
- [ ] 7.4 Manual QA: test on real Android device (API 33+), verify PIN entry automation works
- [ ] 7.5 Cross-layer Checks: Run `bun run lint && bun run typecheck` on extension side
