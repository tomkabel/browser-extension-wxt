## Why

ARCHITECTURE.md Phase 4 defines a JIT credential UX. This change implements a **generic website password manager** as a Phase 1 convenience feature: the user navigates to a login page, the extension detects it, requests credentials from the phone vault, and auto-fills them. This is a standalone productivity feature.

**V6 Scope Distinction:** This change is orthogonal to SMARTID_VAULT_v6.md. V6 does not implement a generic password manager — it is exclusively focused on Smart-ID PKI automation (PIN1 login, PIN2 QES signing). In V6, the "credential" is the Smart-ID PIN, stored in AndroidKeyStore and **decrypted locally in the NDK enclave** — never transmitted over the channel. The website password manager described here is a Phase 1 convenience layer that has no overlap with V6's threat model or architecture. See `vault6-migration-strategy` for the deprecation plan when V6 reaches parity.

Currently the extension can detect transactions (banking) but has no login field detection, credential request protocol, or micro-payload delivery. The password manager UX is entirely absent.

## What Changes

- **DOM login field detector** in content script that identifies username/password fields on page load
- **Credential request message type** (`credential-request`) sent over the WebRTC Data Channel to the phone
- **Context-aware prompt protocol**: Phone decides whether to auto-approve (unlocked) or show notification (locked)
- **Micro-payload response** from phone: single username + password, encrypted over Noise channel
- **DOM injection with immediate garbage collection**: Auto-fill credentials, zero the variables in RAM
- **Domain scoping**: Credential requests include the current domain; phone matches against its vault
- **Rate limiting** for credential requests to prevent abuse

## Capabilities

### New Capabilities

- `login-field-detection`: Content script MutationObserver + form analysis that identifies login forms (username + password fields, `type="password"`, submit buttons) across SPAs and static pages
- `credential-request-protocol`: New `credential-request` command type over the CommandClient/Noise channel; includes domain, URL, and detected field types; response is a micro-payload with credentials
- `context-aware-approval`: Protocol flags for phone unlock state: `auto_approve` when phone is unlocked in-hand, `require_biometric` when locked; extension UI shows corresponding status
- `micro-payload-injection`: Extension receives single-site credentials, auto-fills form fields via DOM API, immediately zeros the plaintext buffer and garbage-collects references

### Modified Capabilities

- `extension-messaging`: New `credential-request` and `credential-response` message types added to the `MessageType` union; content script sends `detect-login-form` to background
- `transaction-flow`: Transaction detection is complemented by credential detection; both use the same WebRTC command channel but different command types

## Impact

- `entrypoints/content/domScraper.ts` — Add `detectLoginForm()` function returning `{ usernameField, passwordField, formAction }`
- `entrypoints/content/index.ts` — Observe DOM mutations for login forms; emit `detect-login-form` message
- `types/index.ts` — Add `credential-request`, `credential-response`, `detect-login-form` to `MessageType`
- `lib/channel/commandClient.ts` — Add `sendCredentialRequest()` method; new command type
- `entrypoints/background/pairingCoordinator.ts` — Route credential requests over Noise channel
- `entrypoints/background/messageHandlers.ts` — Handle `credential-request` and `detect-login-form` messages
- `entrypoints/popup/panels/` — New `CredentialPanel.tsx` showing credential request status
- `entrypoints/popup/App.tsx` — Add CredentialPanel to lazy-loaded panels
- `lib/store.ts` — Add credential request state to Zustand store
- Android: `CredentialRequestHandler.kt`, `AutoApproveManager.kt`, `VaultLookup.kt`

## V6 Alignment

PHASE 1 — This change implements a generic website password manager that is architecturally distinct from V6's Smart-ID PIN automation. In the V6 end state:
- Smart-ID PINs are stored in AndroidKeyStore (biometric-gated, hardware-backed) per V6 §2.4
- PINs are decrypted locally in the NDK C++ enclave (`ndk-enclave-pin-vault`) — never transmitted over any channel
- The Ghost Actuator receives anonymous X/Y coordinates, not credential strings
- Website password management is not part of the V6 threat model or architecture

This change's `context-aware-approval` protocol (phone unlock state detection → auto-approve or biometric prompt) is retained in V6 as the authorization gate for the enclave. The credential storage and DOM injection layers are Phase 1-only and will be deprecated when V6 reaches full integration (see `vault6-migration-strategy` §6 Deprecation Policy).

## Dependencies

- Related: `android-companion-app` (shared credential vault on phone side)
- Superseded by (V6): `ndk-enclave-pin-vault`, `ghost-actuator-gesture-injection` (Smart-ID credential handling path)
