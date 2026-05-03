## Context

Phase 6 of SmartID2. Security hardening and testing for a financial-facing product. Covers CSP hardening, property-based Noise tests, Wycheproof vectors, interop testing, and penetration test documentation.

## Goals / Non-Goals

**Goals:**
- CSP: `connect-src 'self' https://<signaling-server>` only (no ws://, no wss:// wildcards)
- Noise property-based tests: 1000 random payloads, wrong key rejection, sequence monotonicity
- Noise Test Vectors: Run official Noise XX and IK test vectors against both TS and Java implementations
- Interop test: TypeScript initiator ↔ Java responder must produce identical cipher states
- Wycheproof ChaCha20-Poly1305 test vectors against cipher implementation
- Penetration test plan: replay, MITM, QR relay, session hijacking, SW restart

**Non-Goals:**
- Third-party security audit (out of scope for v1)
- Formal verification of Noise implementation (prohibitively expensive)

## Decisions

### 1. CSP Strategy

```json
{
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self' https://<signaling-server-domain> wss://<signaling-server-domain>; frame-src 'self' chrome-extension://<extension-id>;"
  }
}
```

WebRTC data channels establish via ICE candidates, NOT CSP-controlled URLs — eliminating the dynamic IP problem.

### 2. Noise Testing Strategy

3 layers:
1. Unit/property tests on each implementation independently
2. Interop: TypeScript initiator ↔ Java responder (same handshake produces identical cipher states)
3. Differential fuzzing: feed random inputs to both implementations; compare outputs
