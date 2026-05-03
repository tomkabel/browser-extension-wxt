## Why

The core value proposition of SmartID2 is out-of-band transaction verification: detecting a transaction on the banking page DOM and sending it to the phone for user confirmation. This protects against QRLJacking attacks where malware alters the displayed amount before the user approves.

## What Changes

- **Transaction detection content script**: DOM pattern matching for LHV.ee (and other banks) to extract amount, recipient, IBAN from transaction confirmation pages
- **Command protocol**: Type-safe `ControlCommand` / `ControlResponse` message types over Noise-encrypted WebRTC data channel
- **Transaction flow**: Extension sends `authenticate_transaction` with `{ amount, recipient, hash }` → phone displays transaction → user confirms on phone → phone responds `confirm_transaction`
- **No HMAC session token**: Removed — Noise AEAD already authenticates every message
- **Sequence numbers**: Monotonic anti-replay counter; duplicate sequences return cached responses
- **Key rotation**: HKDF-based rekeying every 1000 messages
- **Command signing**: Response includes signature over `(command_hash, sequence, timestamp)` for non-repudiation audit trail

## Capabilities

### New Capabilities

- `transaction-detection`: Content script extracts transaction data from banking page DOM using configurable detectors
- `command-protocol`: Versioned, sequence-numbered command/response message format
- `transaction-flow`: End-to-end verification flow: detect → send → phone display → user confirm → response
- `key-rotation`: Automatic rekeying at 1000 messages via HKDF

### Modified Capabilities

None — these are entirely new capabilities.

## Impact

- `lib/transaction/transactionDetector.ts` — DOM pattern matching engine
- `lib/transaction/detectors/lhvDetector.ts` — LHV.ee-specific patterns
- `lib/channel/commandClient.ts` — Command encoding, sequence management, key rotation
- `types/commands.ts` — ControlCommand, ControlResponse, CommandType enums
- `entrypoints/background/` — Command routing, response handling
- `entrypoints/content/` — Transaction detection on whitelisted banking pages
