## ADDED Requirements

### Requirement: Signed response header attestation verifier

The extension SHALL intercept HTTP responses from whitelisted Smart-ID RP domains and verify a `SmartID-Attestation` response header carrying an ECDSA P-256 signature of the control code. This operates as Tier 3 of the progressive TLS binding proof system. Tier 1 (Sec-Fetch) and Tier 2 (Token Binding) are always attempted first, with Tier 3 as the strongest available proof.

#### Scenario: Extension intercepts attestation header during page load

- **WHEN** the browser loads a main-frame page from a whitelisted RP domain (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)
- **THEN** the extension background service worker SHALL first capture `Sec-Fetch-*` headers for Tier 1
- **AND** attempt WebTransport Token Binding for Tier 2 if the RP supports it
- **AND** additionally intercept the response via `chrome.webRequest.onHeadersReceived`
- **AND** search for the `SmartID-Attestation` header for Tier 3
- **AND** parse the header value in the format: `v1;<base64url(payload)>;<base64url(signature)>;<key-id>`
- **AND** extract the JSON payload containing the control code and session identifier
- **AND** verify the ECDSA P-256 signature using `crypto.subtle.verify()` with the RP's known public key (from `TrustedRpSigningKey` manifest, matched by domain + key-id)
- **AND** the signature SHALL be computed over the canonical raw UTF-8 JSON bytes (deterministic serialization with sorted keys), NOT over the base64url-encoded string

#### Scenario: Attestation verification completes within page load

- **WHEN** the attestation header is present and signature verification succeeds
- **THEN** the extension SHALL promote the active tier to Tier 3 (strongest)
- **AND** the Tier 3 proof SHALL be packaged alongside Tier 1 and Tier 2 proofs
- **AND** the verification SHALL complete synchronously with the page load — no additional latency beyond the page load itself
- **AND** the extension SHALL NOT load any WASM module — Tier 3 header verification is pure TypeScript using Web Crypto API (~100 lines)

#### Scenario: WASM and Offscreen Document not used for Tier 3 header verification

- **WHEN** the extension processes a Tier 3 SmartID-Attestation header
- **THEN** it SHALL NOT load any WASM module (saves ~2MB bundle size)
- **AND** it SHALL NOT require SharedArrayBuffer or COOP/COEP headers
- **AND** it SHALL NOT require an active Offscreen Document for header verification (the existing Offscreen Document is used only for WebRTC and Tier 2 WebTransport)
- **AND** it SHALL NOT require a Notary server or any third-party MPC infrastructure

#### Scenario: Tier 3 header unavailable, using Tier 1

- **WHEN** the SmartID-Attestation header is not present in the response
- **THEN** the extension SHALL fall back to Tier 1 (Sec-Fetch headers) as the binding proof
- **AND** SHALL NOT display an error to the user
- **AND** SHALL log "Tier 3 attestation unavailable, using Tier 1 binding"

#### Scenario: Demo mode with self-signed attestation (Draft / placeholder until bank integration)

- **WHEN** the extension runs in `dev` or `demo` mode (`import.meta.env.DEV` or `MODE=demo`)
- **THEN** the extension SHALL use the bundled demo ECDSA P-256 private key (JWK format) to generate test `SmartID-Attestation` headers
- **AND** the header SHALL be constructed using the same format as production: `v1;<base64url(json)>;<base64url(sig)>;<key-id>`
- **AND** the signature SHALL be created using `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, payloadBytes)`
- **AND** the same `crypto.subtle.verify()` verification path used in production SHALL validate the demo-signed header
- **AND** the demo injector SHALL generate random test control codes (4 digits) for whitelisted domains
- **AND** in production mode, demo header generation SHALL be completely disabled — no demo code path is reachable

#### Scenario: V6 proof transport preserved

- **WHEN** the attested control code is packaged for transport to the Android Vault
- **THEN** the code SHALL be sent as a compact JSON payload (not a ZKP binary)
- **AND** the payload SHALL include: `{ "tier": 3, "controlCode": "4892", "rpDomain": "lhv.ee", "keyId": "lhv-2026q2", "signature": "<base64url>", "secFetch": {...}, "contentHash": "..." }`
- **AND** the Android Vault SHALL run the same tier-aware verification using its local tier policy store
