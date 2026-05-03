## Why

The SMARTID_VAULT_v6.md specification represents a fundamental architectural shift from the current WebRTC-based phone-as-vault architecture. Six major new components are required (USB AOA transport, zkTLS, challenge-bound WebAuthn, NDK enclave, Ghost Actuator, eIDAS QES gate). These cannot be built all at once — they must be sequenced into the existing project without breaking the working WebRTC transport. A migration strategy is essential to ensure coherent progress toward V6 while maintaining delivery velocity on the current architecture.

Without this migration plan, development risks:
- Building WebRTC features that will be abandoned (wasted effort)
- Building V6 features that don't integrate with the existing codebase
- Creating parallel incompatible architectures that fragment the codebase

## What Changes

This change does NOT modify any source code. It produces a sequenced migration plan as a specification artifact.

### Migration Phases

#### Phase 1.5 (Current + Bridge) — 6-8 weeks
Build the Go Native Messaging Host and AOA 2.0 transport alongside the existing WebRTC stack. The extension gets a transport abstraction layer. USB mode is optional, WebRTC is default.
- `usb-aoa-transport-proxy` — Go host with AOA 2.0
- Transport abstraction in extension (`Transport` interface with WebRTC and USB implementations)
- AOA handshake + ECDH key exchange
- WebRTC → USB fallback logic
- `vault6-migration-strategy` tasks (this change)

#### Phase 2A (Core V6 Enclave) — 8-10 weeks
Build the Android-side V6 components that can be tested with the USB transport.
- `ndk-enclave-pin-vault` — C++ memory-locked PIN processing
- `ghost-actuator-gesture-injection` — dispatchGesture automation
- Smart-ID app PIN grid analysis

Phase 2A does NOT require zkTLS yet — it can use the existing WebRTC-transported challenge/response for authorization, with PINs stored in Android Keystore as specified.

#### Phase 2B (zkTLS + WebAuthn Binding) — 10-12 weeks
Build the cryptographic attestation layer.
- `zktls-context-engine` — WASM TLSNotary prover
- `challenge-bound-webauthn` — zkTLS-derived WebAuthn challenge
- Proof verification on Android

Phase 2B can proceed in parallel with 2A since they affect different layers (extension WASM vs Android enclave).

#### Phase 2C (eIDAS QES) — 4-6 weeks
Build the QES compliance layer on top of the completed V6 stack.
- `eidas-qes-hardware-gate` — Volume Down interrupt
- QES audit trail
- Overlay UI for QES

### Existing Spec Adjustments

| Current Spec | V6 Impact | Action |
|---|---|---|---|
| `resilient-transport` (ICE/TURN/WebRTC) | Becomes fallback transport tier | Keep as Phase 1 work; mark V6 target as USB |
| `emoji-sas-verification` | Replaced by AOA ECDH handshake + WebAuthn passkey | Keep for Phase 1; deprecate in Phase 2 |
| `jit-credential-delivery` | Phase 1 generic website password manager — orthogonal to V6 | Mark as Phase 1-only; V6 Smart-ID PINs use NDK enclave (local decrypt, coordinate output) not credential request protocol |
| `android-companion-app` | Evolves into Android Vault app; two co-existing vaults: Phase 1 (website passwords, AES-256-GCM DB) and V6 (Smart-ID PINs, `KeyGenParameterSpec` with biometric + unlock gating) | Add NDK enclave integration path; split into `VaultManager.kt` (Phase 1) and `SmartIdPinVault.kt` (V6) |
| `session-persistence` | WebAuthn PRF for silent re-auth still valid | Keep; WebAuthn PRF used for session resumption on browser restart |
| `signaling-e2ee` | Only relevant for WebRTC fallback path | De-prioritize; AOA transport is inherently encrypted via ECDH+AES |

## Capabilities

### New Capabilities

- `v6-migration-roadmap`: Sequenced transition plan from current WebRTC architecture to V6 USB-AOA architecture
- `transport-abstraction-interface`: Common `Transport` interface unifying WebRTC and USB transport implementations
- `legacy-spec-deprecation-path`: Process for archiving Phase 1 specs when V6 capabilities reach parity

### Modified Capabilities

- All current Phase 1 specs gain a "V6 Replacement" section documenting the superseding V6 component
- `android-companion-app` spec gains V6 evolution path: WebRTC client → WebRTC + AOA → AOA + enclave → full V6

## Impact

- **No code changes** — this change produces only specification artifacts
- **docs/ development roadmap**: Updated with V6 phases replacing/extending the current Q4 2026/Q1 2027 roadmap
- **OpenSpec changes**: New changes (usb-aoa-transport-proxy, zktls-context-engine, etc.) are sequenced into the dependency graph
- **ARCHITECTURE.md**: Updated to reflect that V6 is the ultimate target, with current architecture as Phase 1

## V6 Alignment

PHASE 1.5 — This change ensures the project's trajectory is aligned with the V6 end goal. It does not implement any V6 capability directly but enables coherent delivery of all V6 components.

## Dependencies

- Blocked on: None (strategic planning artifact)
- Related: ALL V6 changes (this change sequences them)
