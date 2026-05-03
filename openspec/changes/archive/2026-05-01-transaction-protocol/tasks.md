## 1. Transaction Detection

- [x] 1.1 Research LHV.ee transaction page DOM structure (inspect .amount-value, .recipient-name selectors)
- [x] 1.2 Implement `transactionDetector.ts` with generic detector engine
- [x] 1.3 Implement `lhvDetector.ts` with LHV.ee-specific selectors
- [x] 1.4 Handle failure modes: UI changes → selector failure → "Cannot detect" message

## 2. Command Protocol Types

- [x] 2.1 Define `ControlCommand` interface with version, sequence, command, payload, timestamp
- [x] 2.2 Define `ControlResponse` interface with version, sequence, status, signature
- [x] 2.3 Define `CommandType` enum with `authenticate_transaction`, `confirm_transaction`, `reject_transaction`, `read_screen`, `ping`

## 3. Command Flow

- [x] 3.1 Implement `sendCommand()` with sequence management (atomic increment of chrome.storage.session counter)
- [x] 3.2 Implement ACK/retry: resend if no ACK received within 5s (max 3 retries)
- [x] 3.3 Implement key rotation: derive new cipher state at message 1000, 2000, etc.
- [x] 3.4 Implement response signature for non-repudiation
- [x] 3.5 Remove HMAC session token (Noise AEAD provides authentication)

## 4. Transaction Flow

- [x] 4.1 Wire content script detection → extension sends `authenticate_transaction` to phone
- [x] 4.2 Phone displays transaction → user confirms → phone sends `confirm_transaction`
- [x] 4.3 Extension popup shows "Transaction confirmed — amounts match on both screens"
