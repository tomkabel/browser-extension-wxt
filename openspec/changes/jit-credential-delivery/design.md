## Context

The extension currently handles transaction verification (banking) but has no credential management (password auto-fill). ARCHITECTURE.md Phase 4 defines the core UX: the phone acts as an encrypted vault, and the laptop is a "dumb terminal" that requests single credentials on demand. The phone decrypts the specific password locally and sends only that one over the E2EE channel. The extension injects it into the DOM and immediately garbage-collects it.

**V6 Boundary:** This change implements a generic website password manager — a Phase 1 convenience feature independent of SMARTID_VAULT_v6.md. V6 is exclusively focused on Smart-ID PKI automation (PIN1/PIN2 for banking flows), where the "credential" is the Smart-ID PIN stored in AndroidKeyStore and processed in an NDK memory-locked enclave. There is no DOM injection or credential transmission in V6 — the PIN never leaves the phone. The `context-aware-approval` logic (phone unlock state detection) from this change is retained in V6 as the authorization gate; the credential request protocol and DOM injection layers are Phase 1-only and superseded by the enclave + actuator pipeline.

This is a significant addition: login field detection in content scripts, a new command type over the existing Noise/WebRTC channel, context-aware phone-side approval logic, and secure DOM injection.

## Goals / Non-Goals

**Goals:**
- Detect login forms across static pages and SPAs using MutationObserver
- Send credential requests over the existing CommandClient/Noise channel
- Phone decrypts and sends single-site credentials (micro-payloads)
- Auto-fill detected fields and immediately zero plaintext buffers
- Rate-limit credential requests to prevent abuse

**Non-Goals:**
- Password generation or vault management UI (phone-side only)
- Credential storage in the extension (phone is the vault)
- Form submission automation (only auto-fill, user clicks submit)
- Multi-step login flows (2FA handled by phone separately)

## Decisions

### Decision 1: Login field detection via selector matching + heuristics

The content script uses a `MutationObserver` to watch for DOM changes and scans for login forms using:
1. **Selectors**: `input[type="password"]`, `input[name*="password" i]`, `input[autocomplete="current-password"]`
2. **Heuristics**: If a password field is found, look for the nearest preceding `input[type="text"|"email"]` as the username
3. **SPA awareness**: Debounced re-scan on `wxt:locationchange` events

**Why MutationObserver over polling**: SPA frameworks often render forms asynchronously. MutationObserver catches DOM insertions efficiently without CPU waste. Debouncing prevents rapid re-scans during framework re-renders.

### Decision 2: Credential request via existing CommandClient protocol

Rather than creating a new message channel, credential requests reuse the existing CommandClient/Noise protocol:
- Command type: `credential-request`
- Trigger: Automatic on login field detection (no popup button required)
- Payload: `{ domain, url, usernameFieldId, passwordFieldId }`
- Response: `{ username, password }` (encrypted over Noise)

**Why reuse CommandClient**: It already has retry logic, key rotation, sequence numbering, and session guards. Adding a new command type is simpler than building a parallel protocol.

### Decision 3: Auto-inject on micro-payload receipt (no manual popup interaction)

The extension SHALL auto-inject credentials into the detected login form fields immediately upon receiving the micro-payload response from the phone. No popup button or additional user interaction is required. The popup displays status only: "Credentials filled automatically" (auto-approve) or "Waiting for phone authentication..." (biometric required).

**Why auto-inject, not button-driven**: ARCHITECTURE.md Phase 4 mandates "A quick fingerprint tap on the phone auto-fills the laptop screen." The phone-side biometric prompt is the sole user verification step. Requiring a popup button creates friction, breaks the "telepathic" UX promise, and adds an extra tap that the architecture explicitly avoids. The popup is informational, not transactional.

### Decision 4: Micro-payload — zero-copy buffer management

When the password arrives from the phone, the extension:
1. Creates a `Uint8Array` view of the decrypted payload
2. Extracts username/password strings
3. Sets `input.value` via the DOM API
4. Overwrites the `Uint8Array` with zeros (`buffer.fill(0)`)
5. Lets both string variables go out of scope for GC

**Why not crypto.subtle**: Web Crypto operations are overkill for in-memory clearing. The `Uint8Array.fill(0)` approach is sufficient for RAM clearing since Chrome's garbage collector will eventually reclaim the heap. The critical security property is that the password doesn't persist in `chrome.storage` or any serialized state.

## Risks / Trade-offs

- [Risk] MutationObserver fires too frequently on dynamic pages → Mitigation: debounce to 500ms; skip if already detected a login form on the current URL
- [Risk] Incorrect username field detection (wrong field paired with password) → Mitigation: use `autocomplete` attribute as strongest signal; provide a "wrong field?" popup button to manually retarget
- [Risk] Phone-side vault lookup latency → Mitigation: credential request has a 10s timeout; if it times out, the popup shows "Phone not responding"
- [Risk] Auto-inject fills the wrong field on unusual form layouts → Mitigation: use `autocomplete` attribute as strongest signal; provide a "Wrong field?" popup action to manually retarget after injection
- [Risk] Credential request flood from malicious page → Mitigation: rate-limit to 1 request per 30 seconds per domain

## V6 Boundary

This change implements a **generic website password manager** (Phase 1). It is architecturally separate from V6's Smart-ID PIN automation flow:

| Aspect | This Change (Phase 1) | V6 Replacement |
|---|---|---|
| Credential type | Website username/password | Smart-ID PIN1/PIN2 |
| Storage | AES-256-GCM encrypted DB, Keystore-backed key | AndroidKeyStore, `KeyGenParameterSpec` with biometric + unlock |
| Transmission | Over Noise-encrypted WebRTC/USB | Never transmitted — decrypted locally in NDK enclave |
| Delivery target | DOM `input.value` via content script | `float[x,y]` coordinate array to Ghost Actuator |
| Lifecycle | Browser session + garbage collection | `mlock()` + `explicit_bzero()` in C++ enclave |

The `context-aware-approval` protocol (phone unlock detection, auto-approve) is retained in V6 as the authorization gate for enclave execution. The credential request and DOM injection layers are Phase 1-only and will be deprecated per `vault6-migration-strategy` §6.
