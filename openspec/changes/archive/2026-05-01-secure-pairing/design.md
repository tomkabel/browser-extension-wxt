## Context

Phase 1 of the SmartID2 architecture. The extension and Android phone must establish a mutually-authenticated secure channel before any commands are sent. This uses QR-based SAS code exchange for one-time pairing, Noise XX handshake for first authentication, and Noise IK for reconnection with cached keys. All communication happens over a WebRTC data channel (DTLS 1.2) with Noise running inside as defense-in-depth.

## Goals / Non-Goals

**Goals:**
- QR displays 6-digit SAS code; phone scans and user visually confirms
- Noise XX handshake establishes session keys with mutual identity hiding
- Noise IK reconnection works with cached static keys (1 round-trip)
- Signaling server relays SDP/ICE between peers
- Paired device keys cached in chrome.storage.session and EncryptedSharedPreferences

**Non-Goals:**
- MFA authentication (separate proposal: webauthn-mfa-gate)
- Command protocol (separate proposal: transaction-protocol)
- Transaction detection (separate proposal: transaction-protocol)

## Decisions

### 1. Noise Library: Re-Evaluate @chainsafe/noise

If `@chainsafe/noise` passes the official Noise Test Vectors, prefer it over custom implementation. An audited library with a clean dependency tree is more secure than 400 LOC of fresh code. Only build custom if the library fails test vectors or has unacceptable dependencies.

### 2. QR Format

`smartid2-pair://<6-digit-auth-code>` — only the code. No IP, port, or public key. Signaling server URL is hardcoded at build time.

### 3. Signaling Server

Minimal Socket.IO server (50 LOC). Room ID = SAS code. Room destroyed when both peers disconnect (30s TTL).
