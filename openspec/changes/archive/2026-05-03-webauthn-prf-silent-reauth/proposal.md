## Why

ARCHITECTURE.md Phase 3 demands the extension holds "zero persistent cryptographic state on the SSD." Currently `lib/crypto/fallbackAuth.ts` stores ECDSA keypairs in `chrome.storage.local` (persistent) protected only by a user PIN. This violates the "Dumb Terminal" principle — the laptop is treated as a compromised I/O device. The architecture specifies WebAuthn PRF (Pseudorandom Function) as a hardware-bound, silent re-authentication mechanism that derives keys from the platform authenticator (TPM/secure enclave) without storing anything on disk. When the browser restarts, the extension silently re-authenticates the WebRTC link without user interaction.

## What Changes

- **Remove `chrome.storage.local` persistence** of cryptographic keypairs from `fallbackAuth.ts`
- **Implement WebAuthn PRF extension** to derive a re-authentication key from the platform authenticator
- **Store PRF-derived key handle** (opaque credential ID) in `chrome.storage.session` — safe because it's meaningless without the platform authenticator
- **Silent re-auth flow on browser restart**: Service worker startup → WebAuthn PRF assertion → re-establish WebRTC session with phone using IK handshake
- **Keep PIN-based fallback** as a secondary path for devices without platform authenticator support
- **Audit and remove all persistent key material** from `chrome.storage.local`

## Capabilities

### New Capabilities

- `webauthn-prf-derivation`: Create a WebAuthn PRF credential during initial pairing; use it to derive a session-bound re-authentication key on every browser restart
- `silent-reauth-flow`: Automatic re-establishment of the WebRTC + Noise session on browser restart using PRF-derived key + IK handshake, with zero user interaction
- `zero-persistent-crypto`: Audit and enforce that no cryptographic secret material persists in `chrome.storage.local`; all keys live in `chrome.storage.session` (RAM) or are derived on-the-fly

### Modified Capabilities

- `session-persistence`: Session restoration on browser restart no longer reads from `chrome.storage.local`; instead triggers WebAuthn PRF assertion → IK handshake reconnection
- `webauthn-auth-page`: Auth page gains a PRF credential creation mode during initial pairing; assertion mode during re-auth

## Impact

- `lib/crypto/fallbackAuth.ts` — **BREAKING**: Remove `chrome.storage.local` persistence; add `derivePrfKey()` and `createPrfCredential()` functions
- `entrypoints/background/sessionManager.ts` — Replace `restorePersistedSession()` with PRF-based re-auth; add IK reconnection trigger
- `entrypoints/auth/main.ts` — Add PRF credential creation/assertion flows
- `entrypoints/background/pairingCoordinator.ts` — Store PRF credential ID during pairing; trigger IK reconnection during re-auth
- `entrypoints/background/index.ts` — Service worker startup now fires silent re-auth
- `lib/channel/noise.ts` — Ensure IK reconnection path works with PRF-derived key
- Android: Must also support PRF-based re-auth (adds PRF credential to pairing handshake)
