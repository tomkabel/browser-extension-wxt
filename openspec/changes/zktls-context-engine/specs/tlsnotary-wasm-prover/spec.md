## ADDED Requirements

### Requirement: WASM-compiled TLSNotary prover

The extension SHALL host a WASM-compiled TLSNotary/DECO MPC prover in the Offscreen Document for generating ZKPs of TLS transcript inclusion.

#### Scenario: WASM module loads (cold-start and cache)

- **WHEN** a whitelisted RP domain is detected
- **THEN** the Offscreen Document SHALL first attempt to read the WASM module from `chrome.storage.local` (cache hit)
- **AND** if the module is not cached, SHALL fall back to a bootstrap load (web-accessible extension resource or pinned URL)
- **AND** after a successful load, SHALL cache the module in `chrome.storage.local` for subsequent loads (see tasks.md task 2.3 lazy-load, task 6.5 cache-after-first-load)
- **AND** the module SHALL initialize within 500ms when loaded from cache; bootstrap loads that may exceed this threshold are acceptable
- **AND** if SharedArrayBuffer is available, enable MPC prover threads

#### Scenario: TLS 1.3 handshake observation

- **WHEN** the prover is initialized
- **THEN** it SHALL observe the TLS 1.3 handshake between the browser and the RP server
- **AND** commit to specific parts of the TLS transcript
- **AND** the observation SHALL complete within 200ms

#### Scenario: ZKP generation

- **WHEN** the transcript is committed and the control code is provided
- **THEN** the prover SHALL generate a ZKP of inclusion for the control code substring
- **AND** the proof generation SHALL complete within 1000ms
- **AND** the proof SHALL be <4KB in size
