## ADDED Requirements

### Requirement: WASM-compiled TLSNotary prover

The extension SHALL host a WASM-compiled TLSNotary/DECO MPC prover in the Offscreen Document for generating ZKPs of TLS transcript inclusion.

#### Scenario: WASM module loads

- **WHEN** a whitelisted RP domain is detected
- **THEN** the Offscreen Document SHALL load the WASM module from `chrome.storage.local`
- **AND** the module SHALL initialize within 500ms (cold load)
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
