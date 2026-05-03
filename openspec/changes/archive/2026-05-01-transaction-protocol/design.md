## Context

Phase 3 of SmartID2. Defines the transaction detection engine and command protocol that carries transaction data from the banking page DOM, through the Noise-encrypted WebRTC data channel, to the phone, and back with a user confirmation.

## Goals / Non-Goals

**Goals:**
- Content script detects transaction amount + recipient from LHV.ee DOM (selector patterns: `.amount-value`, `.recipient-name`)
- ControlCommand/ControlResponse type definitions with versioning, sequence numbers, monotonic anti-replay
- Transaction flow: detect → authenticate_transaction → phone displays → user confirms → confirm_transaction response
- No HMAC session token — Noise AEAD provides authentication
- Key rotation at 1000 messages via HKDF
- Command signing for non-repudiation (response includes signature)

**Non-Goals:**
- Multi-bank support (LHV.ee only for v1; detector architecture supports adding banks)
- Generic phone control clicks (command set is limited to transaction operations)

## Decisions

### 1. No HMAC Session Token

Removed per architecture correction. Noise AEAD authenticates every transport message. Sequence numbers provide replay protection independently.

### 2. Command Signature for Non-Repudiation

Response includes `signature` field: Noise session key signature over `(command_hash, sequence, timestamp)`. This creates a verifiable audit trail for financial dispute resolution.
