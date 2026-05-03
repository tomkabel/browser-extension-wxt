# v6-rate-limiting Specification

## Purpose

Extend the existing Phase 1 rate limiting framework (`lib/rateLimit/`) to cover V6-specific authentication, gesture, attestation, and hardware connection paths. These limits prevent brute-force PIN guessing, gesture spam, CPU exhaustion via zkTLS verification, and USB port flooding.

## Requirements

### Requirement: Rate limit PIN authorization requests

The NDK enclave PIN authorization endpoint SHALL reject excessive attempts to prevent brute-force PIN discovery.

#### Scenario: PIN attempt rate limit enforced

- **WHEN** more than 3 PIN authorization requests arrive within a 60-second window for the same device
- **THEN** the 4th and subsequent requests SHALL return `{ success: false, error: 'PIN rate limited' }`
- **AND** the enclave SHALL NOT process the PIN
- **AND** a 60-second cooldown SHALL be enforced before any further attempts from that device

### Requirement: Rate limit Ghost Actuator gesture retries

The Ghost Actuator accessibility service SHALL prevent rapid-fire gesture injection that could overwhelm the target app or trigger Android's input flood protection.

#### Scenario: Gesture retry limit enforced

- **WHEN** a single gesture fails and is retried more than 2 times
- **THEN** the 3rd retry SHALL be rejected with `{ success: false, error: 'Max gesture retries exceeded' }`
- **AND** the overall gesture dispatch pipeline SHALL allow no more than 5 gestures within any 30-second window
- **AND** exceeding the 5-gesture window SHALL trigger a 30-second cooldown

### Requirement: Rate limit QES gate timeout/retry

The eIDAS QES hardware gate SHALL enforce strict one-attempt-per-transaction semantics to prevent signature replay or repeated QES prompts.

#### Scenario: QES attempt and transaction rate limits enforced

- **WHEN** a QES gate is opened for a transaction
- **THEN** exactly 1 Volume Down attempt SHALL be permitted for that transaction
- **AND** if the user fails to respond within 10 seconds, the gate SHALL close and the transaction SHALL be rejected
- **AND** no more than 3 QES transactions SHALL be initiated within any 5-minute window
- **AND** exceeding 3 transactions per 5 minutes SHALL return `{ success: false, error: 'QES transaction quota exceeded' }`

### Requirement: Rate limit zkTLS attestation verification

The zkTLS proof verification handler SHALL limit verification frequency to prevent CPU exhaustion attacks against the extension or Android Vault.

#### Scenario: zkTLS verification rate limit enforced

- **WHEN** more than 10 zkTLS attestation verifications arrive within a 60-second window from the same domain
- **THEN** the 11th and subsequent verifications SHALL return `{ success: false, error: 'zkTLS verification rate limited' }`
- **AND** the proof SHALL NOT be verified
- **AND** the rate limiter SHALL be scoped per-domain (eTLD+1)

### Requirement: Rate limit USB AOA connection attempts

The USB AOA transport manager SHALL prevent rapid reconnection attempts that could spam the USB bus or trigger Android permission fatigue.

#### Scenario: USB AOA connection spam prevented

- **WHEN** more than 5 USB AOA connection attempts occur within a 60-second window for the same device
- **THEN** the 6th and subsequent attempts SHALL return `{ success: false, error: 'USB connection rate limited' }`
- **AND** the transport manager SHALL NOT open a new `UsbAccessory` connection
- **AND** a 60-second cooldown SHALL be enforced before automatic retry resumes

## Implementation Notes

- All V6 rate limiters SHALL reuse the existing sliding-window implementation in `lib/rateLimit/` where applicable.
- Domain scoping for zkTLS SHALL use `domainParser.ts` (eTLD+1) to ensure `sub1.example.com` and `sub2.example.com` share the same quota.
- Device scoping for PIN and USB limits SHALL use the Android device's stable hardware serial hash (SHA-256 of `Build.SERIAL` or `Build.ID`), never the raw serial.
- Rate limit state for extension-side limits (zkTLS, QES transaction count) SHALL be stored in `chrome.storage.session` (RAM-only) to avoid SSD persistence of timing metadata.
- Android-side rate limit state (PIN, gesture, USB) SHALL be stored in `android.content.SharedPreferences` with `Context.MODE_PRIVATE` and cleared on app restart.
