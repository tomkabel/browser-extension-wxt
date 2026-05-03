## ADDED Requirements

### Requirement: Memory sanitization with explicit_bzero

The NDK enclave SHALL zero all secret buffers on all exit paths using a compiler-optimization-resistant `explicit_bzero()` implementation.

#### Scenario: Normal completion

- **WHEN** coordinate mapping completes successfully
- **THEN** the PIN buffer SHALL be zeroed via `explicit_bzero()`
- **AND** a memory barrier (`std::atomic_signal_fence(std::memory_order_seq_cst)`) SHALL follow

#### Scenario: Error path

- **WHEN** any error occurs during PIN decryption or coordinate mapping
- **THEN** the buffer SHALL be zeroed before returning the error
- **AND** SHALL NOT contain partial plaintext data

#### Scenario: Signal handler — async-signal-safe only

- **WHEN** a SIGSEGV or SIGTERM is received during enclave operation
- **THEN** the signal handler SHALL zero the buffer via `explicit_bzero()` (signal-safe — volatile function pointer to bzero)
- **AND** SHALL issue `std::atomic_signal_fence(std::memory_order_seq_cst)` to prevent reordering between the handler and the interrupted code path
- **AND** SHALL set a volatile `sig_atomic_t` deferred-cleanup flag
- **AND** SHALL NOT call `munlock()` or `munmap()` — neither is async-signal-safe and both may deadlock if the signal interrupted a malloc/free internal lock
- **AND** the deferred cleanup (munlock, munmap) SHALL be performed on the next enclave entry point (subsequent `decryptAndMap()` call or `JNI_OnLoad` error path)
