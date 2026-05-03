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

#### Scenario: Signal handler

- **WHEN** a SIGSEGV or SIGTERM is received during enclave operation
- **THEN** the signal handler SHALL zero the buffer via `explicit_bzero()`
- **AND** SHALL issue `std::atomic_signal_fence(std::memory_order_seq_cst)` to prevent reordering between the handler and the interrupted code path
- **AND** SHALL call `munlock()` and `munmap()`
