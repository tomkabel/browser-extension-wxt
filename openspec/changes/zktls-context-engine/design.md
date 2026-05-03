## Context

The Attestation Context Engine provides mathematical certainty about what a bank's server transmitted to the browser. It uses a simple, standard cryptographic approach: the bank's server includes a signed HTTP response header (`SmartID-Attestation`) containing the control code. The extension verifies the ECDSA P-256 signature using the bank's known public key.

This replaces the TLSNotary/DECO WASM MPC prover approach (previously specified). The replacement is possible because:

1. **Smart-ID RP banks are cooperative**: The whitelist of 4 banks (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee) are known business partners. Adding a response header is trivial for them and requires no protocol change.

2. **The threat model doesn't change**: A RAT on the user's device can strip or modify the header, but cannot forge a valid ECDSA P-256 signature because it lacks the bank's private signing key. The worst outcome is degraded to DOM-only mode (current behavior).

3. **No external infrastructure needed**: No Notary server, no WASM compilation, no Offscreen Document prover host, no SharedArrayBuffer.

The proving operates as follows:
1. The user navigates to a whitelisted RP and initiates a Smart-ID login
2. The bank's server generates the control code and includes it in both the HTML DOM and a `SmartID-Attestation` response header
3. The extension intercepts the response via `chrome.webRequest.onHeadersReceived`
4. The extension parses the header, extracts the signed payload, and verifies the ECDSA P-256 signature using the bank's public key
5. The attested control code is cross-referenced with the DOM-scraped code
6. On match: highest confidence; on mismatch: use attested code (RAT detected); on missing header: degrade to DOM-only

## Goals / Non-Goals

**Goals:**
- ECDSA P-256 signature verification via `crypto.subtle.verify()` for attested control codes
- Response header interception via `chrome.webRequest.onHeadersReceived` in service worker
- `TrustedRpSigningKey` manifest for whitelisted RP domains (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)
- Cross-reference attested code with DOM-scraped code for defense-in-depth
- Secure key rotation with signed manifest and rollback protection
- Proof delivery to Android Vault over existing transport (USB/WebRTC) for WebAuthn challenge binding
- Support for multiple active signing keys per RP (for key rotation without window gaps)

**Non-Goals:**
- WASM module loading or compilation (removed — no longer needed)
- Offscreen Document prover host (removed — attestation runs in service worker)
- Notary server deployment or operation (removed — no third-party MPC participant)
- ZKP serialization or compact binary proof format (removed — attestation is a HTTP header)
- TLS 1.2 support (all Smart-ID RPs use TLS 1.3, and this approach is TLS-version-agnostic)

## Decisions

### 1. Attestation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER EXTENSION (Service Worker)                          │
│                                                              │
│  1. User navigates to lhv.ee, initiates Smart-ID login       │
│  2. Server responds with HTML + header:                      │
│     SmartID-Attestation: v1;cid=<code>;sig=<signature>      │
│  3. webRequest.onHeadersReceived intercepts the response     │
│  4. Extension parses header, looks up RP public key          │
│  5. crypto.subtle.verify() with ECDSA P-256                  │
│  6. If valid: attested code = what bank sent                 │
│  7. Cross-reference with DOM-scraped code                    │
│  8. Attested code sent over USB/WebRTC to Android Vault      │
│                                                              │
│  ANDROID VAULT (Java Orchestrator)                           │
│                                                              │
│  9. AttestationVerifier receives {code, signature, keyId}    │
│  10. Verifies ECDSA P-256 signature with local public key    │
│  11. Extracts attested control code for ChallengeVerifier    │
└─────────────────────────────────────────────────────────────┘
```

### 2. Header Format

```
SmartID-Attestation: v1;<base64url(json-payload)>;<base64url(ecdsa-signature)>;<key-id>

Where json-payload = {"code":"4892","session":"abc123","ts":1715000000}
```

The header format uses base64url (RFC 4648 §5, no padding) for safe HTTP transport:
- `v1` — format version identifier
- `payload` — UTF-8 JSON, base64url-encoded
- `signature` — raw ECDSA P-256 signature (r||s, 64 bytes), base64url-encoded
- `key-id` — plaintext string identifying which signing key was used (e.g. `"lhv-2026q2"`)

Total header size: approximately 150-200 bytes (vs 4KB ZKP proof target and 2MB WASM module).

### 3. Signature Verification

```typescript
// Pure TypeScript — no WASM, no Offscreen Document
// Runs in extension service worker via chrome.webRequest.onHeadersReceived

const encoder = new TextEncoder();

async function verifyAttestation(
    rawHeader: string,
    rpDomain: string
): Promise<AttestedCode | null> {
    const parts = rawHeader.split(';');
    if (parts[0] !== 'v1' || parts.length !== 4) return null;

    const [, payloadB64, sigB64, keyId] = parts;
    const sig = base64urlDecode(sigB64);
    const payloadBytes = encoder.encode(payloadB64);
    const payload = JSON.parse(atob(payloadB64));

    const pubKey = TRUSTED_RP_KEYS[rpDomain]?.[keyId];
    if (!pubKey) {
        log.warn(`Unknown key-id ${keyId} for ${rpDomain}`);
        return null;
    }

    const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pubKey,
        sig,
        payloadBytes
    );

    if (!valid) {
        log.warn(`Invalid attestation signature for ${rpDomain}`);
        return null;
    }

    return { code: payload.code, keyId, signature: sigB64 };
}
```

### 4. RP Signing Key Management

Bank/RP signing keys are ECDSA P-256 keys dedicated to this purpose (NOT the bank's TLS certificate keys):

```typescript
interface TrustedRpSigningKey {
  domain: string          // e.g. "lhv.ee"
  keyId: string           // e.g. "lhv-2026q2" — used for rotation
  publicKey: CryptoKey    // ECDSA P-256, imported via crypto.subtle.importKey()
  notBefore: string       // ISO 8601
  notAfter: string        // ISO 8601
}
```

Keys are updated via:
- Bundled with extension release (initial set, 4 domains × 1-2 keys each)
- Background update check against a signed key manifest
- User can manually trigger an update in the popup

Key rotation is handled by pre-distributing the new key before the old key expires (overlap window). Multiple active keys per domain are supported.

### 5. Performance Budget

| Operation | Budget | Implementation |
|---|---|---|
| Response header interception | <1ms | webRequest listener callback |
| Header parsing + key lookup | <5ms | Local Map lookup |
| ECDSA P-256 signature verify | <10ms | Web Crypto API (native) |
| Cross-reference with DOM | <1ms | String comparison |
| Android-side verification | <10ms | Java crypto API |
| Total latency added | <20ms | Zero network round trips |
| Bundle size added | ~200 bytes | Pure TypeScript |

Compare with the prior TLSNotary approach: 2MB WASM module, 1-2s ZKP generation, Notary server RTT.

## Risks / Trade-offs

- [Risk] Bank must add a response header — This requires coordination with each of the 4 whitelisted RPs. However, the implementation cost per bank is trivial: add one response header on the Smart-ID login endpoint. This is substantially simpler than deploying a Notary server or modifying TLS behavior.
- [Risk] Header may be stripped by intermediaries — Proxies, AV software, or the RAT can strip the `SmartID-Attestation` header. The extension gracefully degrades to DOM-only mode in this case (same security level as today's V5). The RAT cannot forge a valid signature.
- [Risk] Key rotation synchronization — If the bank rotates their signing key and the extension's manifest is outdated, verification fails until the manifest refreshes. Mitigated by: bundling keys with overlap windows, background manifest refresh, and graceful degradation to DOM-only.
- [Trade-off] No TLSNotary, no witness of the TLS transcript — This approach proves "the bank's signing key committed to this control code" rather than "the bank's TLS session contained this string." The security level is equivalent for the threat model: a RAT cannot forge either, and both degrade to DOM-only on failure. The operational complexity is drastically lower.
- [Trade-off] No WASM, no Offscreen Document — Attestation runs entirely in the service worker. The existing Offscreen Document is preserved for WebRTC only. No `SharedArrayBuffer` or `COOP/COEP` headers needed anywhere.
- [Risk] Replay of old attestation headers — Mitigated by including a session identifier and timestamp in the signed payload. The Android Vault checks that the session matches the current WebAuthn transaction.
