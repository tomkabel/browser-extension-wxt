## ADDED Requirements

### Requirement: mlock memory allocator

The NDK enclave SHALL implement a memory allocator using `mlock()` for physical RAM locking, with PROT_NONE guard pages for overflow detection.

#### Scenario: Buffer allocated with guard pages

- **WHEN** `MlockAllocator.allocate()` is called
- **THEN** the allocator SHALL `mmap()` a region with total size = 2 guard pages + MAX_PIN_SIZE (32 bytes) + 2 guard pages
- **AND** each guard page SHALL be `PROT_NONE` (no access)
- **AND** the middle region SHALL be `PROT_READ | PROT_WRITE`
- **AND** the middle region SHALL be `mlock()`-ed in RAM
- **AND** the middle region SHALL be poisoned with `0xAA` pattern

#### Scenario: Buffer deallocated securely

- **WHEN** `MlockAllocator.deallocate()` is called
- **THEN** the data region SHALL be zeroed with `explicit_bzero()`
- **AND** the data region SHALL be `munlock()`-ed
- **AND** the full mmap region (including guard pages) SHALL be `munmap()`-ed

#### Scenario: mlock budget check

- **WHEN** `allocate()` is called
- **THEN** the allocator SHALL check `getrlimit(RLIMIT_MEMLOCK)` for sufficient budget
- **AND** if budget is inadequate, SHALL log a warning and fall back to `madvise(MADV_WILLNEED | MADV_DONTDUMP)`
