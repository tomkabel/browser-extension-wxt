## ADDED Requirements

### Requirement: SHA-256 challenge derivation

The extension SHALL derive the WebAuthn challenge as SHA-256 of a canonical TLV serialization of TLS binding proof, origin, control code, and session nonce (version 0x02).

#### Scenario: Challenge derived from valid inputs (Tier 1)

- **GIVEN** the extension has captured the Sec-Fetch-* headers (site, dest, mode) via `webRequest.onHeadersReceived`, detected the transaction origin, extracted the control code, and generated a 32-byte session nonce via CSPRNG
- **WHEN** the extension calls the challenge derivation function
- **THEN** the function SHALL serialize components in this order with fixed-length TLV encoding:
  - Version (1 byte, value 0x02)
  - Tier byte (1 byte: 0x01 for Tier 1, 0x02 for Tier 2, 0x03 for Tier 3)
  - TLS_Binding_Proof length (2 bytes, big-endian)
  - TLS_Binding_Proof bytes (variable, up to 4096):
    - Tier 1: canonical JSON of `{ site: string, dest: string, mode: string, contentHash: bytes }`
    - Tier 2: Tier 1 payload + Token Binding proof bytes
    - Tier 3: Tier 1+2 payload + DECO proof bytes
  - Origin length (2 bytes, big-endian)
  - Origin bytes (UTF-8 URL)
  - Control code length (1 byte, value 0x04)
  - Control code bytes (4 ASCII digits)
  - Session nonce (32 bytes)
  - Padding (zero-filled, to next 32-byte boundary)
- **AND** the function SHALL return `SHA-256(serialized_bytes)`

#### Scenario: Challenge derived from valid inputs (Tier 2)

- **GIVEN** the extension has captured Tier 1 headers AND completed WebTransport token binding
- **WHEN** the challenge is derived with tier byte 0x02
- **THEN** the TLS binding payload SHALL include both Tier 1 Sec-Fetch fields and the Token Binding proof

#### Scenario: Challenge derived from valid inputs (Tier 3)

- **GIVEN** the extension has captured Tier 1+2 AND completed DECO WASM oracle proof
- **WHEN** the challenge is derived with tier byte 0x03
- **THEN** the TLS binding payload SHALL include all three tiers' proof data

#### Scenario: Deterministic output

- **WHEN** the function is called twice with identical inputs
- **THEN** both outputs SHALL be identical byte arrays

#### Scenario: Different nonce produces different challenge

- **WHEN** the function is called with identical TLS binding proof, origin, and control code but different session nonces
- **THEN** the outputs SHALL differ

### Requirement: Session nonce generation

The extension SHALL generate a cryptographically random 32-byte nonce per authentication session.

#### Scenario: Nonce generation

- **WHEN** a new authentication session starts
- **THEN** the extension SHALL generate a 32-byte nonce using `crypto.getRandomValues()`
- **AND** include it in the TLS binding proof metadata transmitted to the Android Vault

### Requirement: Tier auto-negotiation

The extension SHALL attempt the highest available tier at challenge time, degrading gracefully.

#### Scenario: Tier 3 unavailable, fallback to Tier 2

- **WHEN** the DECO WASM oracle is not loaded (or times out)
- **THEN** the extension SHALL attempt WebTransport Token Binding (Tier 2)
- **AND** if Token Binding endpoint is unavailable (404/timeout), fallback to Tier 1

#### Scenario: Tier 1 always succeeds

- **WHEN** `webRequest.onHeadersReceived` has fired for the main frame
- **THEN** Tier 1 SHALL always be available (Sec-Fetch headers are present on all modern browser HTTP navigations)

### Requirement: Sec-Fetch header capture

The extension SHALL capture `Sec-Fetch-Site`, `Sec-Fetch-Dest`, and `Sec-Fetch-Mode` headers from the transaction page's main-frame navigation response.

#### Scenario: Headers captured on page load

- **WHEN** the browser loads a main-frame page from any URL
- **THEN** the extension SHALL intercept via `chrome.webRequest.onHeadersReceived` with filter `{ urls: ['<all_urls>'], types: ['main_frame'] }`
- **AND** extract: `sec-fetch-site`, `sec-fetch-dest`, `sec-fetch-mode`
- **AND** store them keyed by tabId for later challenge derivation

#### Scenario: SPA navigation requires content hash recomputation

- **WHEN** the page navigates via SPA (detected via `wxt:locationchange`)
- **THEN** the extension SHALL recompute the visible DOM content hash
- **AND** use the same Sec-Fetch headers from the initial page load (they don't change for SPA navigations)

---
:test-resources
| Scenario | Test File | Test Name |
|---|---|---|
| Challenge derived from valid inputs | `lib/webauthn/__tests__/challengeDerivation.test.ts` | `serializes components in TLV order with tier byte` |
| Deterministic output | `lib/webauthn/__tests__/challengeDerivation.test.ts` | `same inputs produce identical hash` |
| Different nonce produces different challenge | `lib/webauthn/__tests__/challengeDerivation.test.ts` | `different nonce changes challenge` |
| Tier auto-negotiation | `lib/tlsBinding/__tests__/tierNegotiation.test.ts` | `degrades to lowest available tier` |
| Sec-Fetch header capture | `lib/tlsBinding/__tests__/secFetchCapture.test.ts` | `captures headers from main_frame response` |
