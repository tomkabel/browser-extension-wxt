## Context

ARCHITECTURE.md Phase 3 demands that the extension holds "zero persistent cryptographic state on the SSD." The current implementation violates this by storing ECDSA keypairs in `chrome.storage.local` (persistent) via `lib/crypto/fallbackAuth.ts`. The architecture specifies WebAuthn PRF as the mechanism for silent re-authentication — the extension creates a PRF-enabled WebAuthn credential during initial pairing, and on every browser restart, silently asserts that credential to derive a re-authentication key from the platform authenticator (TPM/Secure Enclave).

This key is then used to perform an IK (Interactive Key) Noise handshake with the phone to re-establish the session without user interaction.

## Goals / Non-Goals

**Goals:**
- Create a WebAuthn credential with the `prf` extension during initial pairing
- On browser restart, silently assert the PRF credential to derive a key
- Use the PRF-derived key to complete an IK handshake with the phone
- Remove all persistent cryptographic key material from `chrome.storage.local`
- Maintain backwards compatibility: PIN-based fallback for devices without platform authenticator

**Non-Goals:**
- Replacing the Noise XX initial pairing (PRF is for re-auth only, not initial pairing)
- WebAuthn PRF on Android (Android companion app uses its own Keystore mechanism)
- Multiple PRF credentials per device (one credential per paired phone)

## Decisions

### Decision 1: WebAuthn PRF extension for key derivation

Use the `prf` extension during `navigator.credentials.create()` and `navigator.credentials.get()` to derive deterministic symmetric keys from the platform authenticator. The PRF is evaluated with a salt derived from the phone's static public key, ensuring the derived key is unique per pairing.

```
prfInput = SHA-256(phone_static_public_key || "smartid2-reauth-v1")
prfOutput = authenticator.prf.eval(prfInput)
reAuthKey = prfOutput.first  // 32-byte symmetric key
```

**Why PRF over storing encrypted keys**: The PRF output is never stored — it is re-derived on every assertion from the authenticator's internal secret. This matches the "RAM-only" principle: the derived key lives only for the duration of the re-auth handshake.

### Decision 2: Discoverable credential — no software-side caching required

The PRF credential is created as a **discoverable credential** (resident key) on the platform authenticator during initial pairing. After creation, the extension does NOT need to persist anything across browser restarts — the authenticator retains the credential internally. On restart, the extension calls `navigator.credentials.get()` with an empty or omitted `allowCredentials` parameter, and the authenticator discovers and returns the existing PRF credential.

The opaque credential ID (200-400 bytes) MAY be stored in `chrome.storage.session` as a performance optimization for SW wake events that are NOT full browser restarts (e.g., SW termination while popup is closed). This cache is wiped when the browser closes and is never treated as the source of truth.

**Why discoverable credentials align with 'RAM-only' principle**: The authenticator hardware (TPM/Secure Enclave) is the sole persistent store. The extension holds zero cryptographic material on the SSD — matching the ARCHITECTURE.md Phase 3 "Dumb Terminal" requirement. The term "cached key" in ARCHITECTURE.md refers to the authenticator's hardware-bound retention, not to any software-side cache.

### Decision 3: Silent assertion with `mediation: 'conditional'` fallback

For the silent re-auth on browser restart, the extension calls `navigator.credentials.get()` with no `allowCredentials` (discoverable) and `mediation: 'silent'`. If the platform authenticator doesn't support silent mediation, it falls back to `mediation: 'conditional'` which may show a brief UI. If neither works, the extension shows "Reconnect to phone" in the popup.

**Why**: Chrome on desktop supports `mediation: 'silent'` for platform authenticators (Windows Hello, macOS TouchID). Omitting `allowCredentials` lets the authenticator discover the credential created during pairing without the extension needing to store any credential ID across restarts. On Linux or devices without platform authenticators, we degrade to PIN fallback.

## Risks / Trade-offs

- [Risk] WebAuthn PRF is only supported in Chrome 116+ → Mitigation: feature-detect and fall back to PIN-based auth for older browsers
- [Risk] Platform authenticator may be unavailable (VM, headless) → Mitigation: PIN fallback remains as the escape hatch
- [Risk] PRF credential loss if TPM is reset or OS is reinstalled → Mitigation: re-pair with phone (scan QR again) as recovery path
