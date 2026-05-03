## ADDED Requirements

### Requirement: Signed response header attestation verifier

The extension SHALL intercept HTTP responses from whitelisted Smart-ID RP domains and verify a `SmartID-Attestation` response header carrying an ECDSA P-256 signature of the control code. This replaces the TLSNotary WASM MPC prover approach (removed due to: unresolved TLS witness architecture, AGPL licensing risk, Notary server requirement, and WASM binary size).

#### Scenario: Extension intercepts attestation header during page load

- **WHEN** the browser loads a main-frame page from a whitelisted RP domain (lhv.ee, swedbank.ee, seb.ee, tara.ria.ee)
- **THEN** the extension background service worker SHALL intercept the response via `chrome.webRequest.onHeadersReceived`
- **AND** search for the `SmartID-Attestation` header
- **AND** parse the header value in the format: `v1;<base64url(payload)>;<base64url(signature)>;<key-id>`
- **AND** extract the JSON payload containing the control code and session identifier
- **AND** verify the ECDSA P-256 signature using `crypto.subtle.verify()` with the RP's known public key (from `TrustedRpSigningKey` manifest, matched by domain + key-id)

#### Scenario: Attestation verification completes within page load

- **WHEN** the attestation header is present and signature verification succeeds
- **THEN** the extension SHALL dispatch the attested control code to the control code verification pipeline
- **AND** the verification SHALL complete synchronously with the page load — no additional latency beyond the page load itself
- **AND** the extension SHALL NOT load any WASM module — the implementation is pure TypeScript using Web Crypto API (~100 lines)

#### Scenario: WASM and Offscreen Document not used

- **WHEN** the extension initiates attestation for a whitelisted RP
- **THEN** it SHALL NOT load any WASM module (saves ~2MB bundle size)
- **AND** it SHALL NOT require SharedArrayBuffer or COOP/COEP headers
- **AND** it SHALL NOT require an active Offscreen Document for attestation (the existing Offscreen Document is used only for WebRTC)
- **AND** it SHALL NOT require a Notary server or any third-party MPC infrastructure

#### Scenario: V6 proof transport preserved

- **WHEN** the attested control code is packaged for transport to the Android Vault
- **THEN** the code SHALL be sent as a compact JSON payload (not a ZKP binary)
- **AND** the payload SHALL include: `{ "controlCode": "4892", "rpDomain": "lhv.ee", "keyId": "lhv-2026q2", "signature": "<base64url>" }`
- **AND** the Android Vault SHALL run the same ECDSA P-256 verification using its local copy of the `TrustedRpSigningKey` public key
