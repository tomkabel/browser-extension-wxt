# Repair Noise XX Handshake — Remote Static Key Extraction

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

`entrypoints/background/pairingCoordinator.ts:1111` sets `remoteStaticPk = new Uint8Array(32)` (a zero-filled buffer) instead of extracting the actual remote static public key from the Noise handshake `Handshake` object. The XX handshake protocol transmits the responder's static key in message 2 (encrypted under the ephemeral shared secret), and the library exposes it via `handshake.getRemoteStaticPublicKey()` or equivalent accessor. By discarding this value the downstream `createNoiseSession()` and `completePairing()` operate on a null key, rendering the cryptographic identity binding void.

Additionally, `waitForDataChannelMessage()` attaches a `browser.runtime.onMessage` listener that is never removed, creating a memory leak and duplicate listener accumulation across multiple pairing attempts.

### Solution

1. In `performXXHandshake()`, after `handshake.readMessage(msg2Content)`, call the library's accessor to obtain the remote static public key instead of creating a zero-filled buffer.
2. Replace the anonymous listener in `waitForDataChannelMessage()` with a named function and call `browser.runtime.onMessage.removeListener()` after the promise settles (resolve or timeout).
3. Remove the dead `originalHandler`/`wrappedHandler` delegation pattern — the function already only handles handshake messages.

### Acceptance Criteria

- `remoteStaticPk` contains the actual 32-byte X25519 public key from the responder, verified via test vector.
- `browser.runtime.onMessage` has no orphaned listeners after handshake timeout (verified with listener count inspection).
- An XX handshake test with known keys reproduces the correct split transport state.
