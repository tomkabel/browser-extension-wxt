## Why

The SMARTID_VAULT_v6.md specification represents a fundamental architectural shift from the current WebRTC-based phone-as-vault architecture. Six major new components are required (USB AOA transport, zkTLS, challenge-bound WebAuthn, NDK enclave, Ghost Actuator, eIDAS QES gate). These cannot be built all at once — they must be sequenced into the existing project without breaking the working WebRTC transport. A migration strategy is essential to ensure coherent progress toward V6 while maintaining delivery velocity on the current architecture.

Without this migration plan, development risks:
- Building WebRTC features that will be abandoned (wasted effort)
- Building V6 features that don't integrate with the existing codebase
- Creating parallel incompatible architectures that fragment the codebase

## What Changes

This change does NOT modify any source code. It produces a sequenced migration plan as a specification artifact.

### Migration Phases

#### Phase 1 (Current — WebRTC + React Native) — 6-10 weeks
Deliver an end-to-end phone-as-vault experience. The browser extension is already built; this phase completes the system with the React Native companion app.
- `react-native-companion-app` — React Native vault app with WebRTC client, Noise XX responder, credential vault, and Ghost Actuator bridge
- `native-host-quality-gate` — WebUSB transport, Go host AOA shim (ongoing)
- `resilient-transport` — QR-embedded SDP, static TURN, event-driven USB
- `jit-credential-delivery` — Credential request protocol (extension side complete; phone-side via RN app)

#### Phase 1.5 (USB Bridge) — 4-6 weeks
USB AOA becomes primary transport; WebRTC retained as fallback.
- `native-host-quality-gate` completes — Go AOA shim production-ready
- `native-host-quality-gate` — WebUSB transport in offscreen document
- AOA handshake + ECDH key exchange in extension and RN app (new native module)
- WebRTC → USB fallback logic in TransportManager

#### Phase 2A (Core V6 Enclave) — 8-10 weeks
Hardens the vault with NDK memory-locked enclave, replacing JS-level PIN processing.
- `ndk-enclave-pin-vault` — C++ memory-locked PIN processing, coordinate output via JSI TurboModule
- `ghost-actuator-gesture-injection` — dispatchGesture automation (Kotlin complete; coordinate source switches from JS to enclave)
- `vault-encryption-recovery` — Shamir 2-of-3 recovery, Merkle tree revocation
- `multi-device-revocation` — Device registry, device switching, signed revocation

#### Phase 2B (TLS Binding + WebAuthn) — 8-10 weeks
Build the progressive TLS binding and challenge-bound WebAuthn layer.
- `zktls-context-engine` — Three-tier TLS binding: Tier 1 Sec-Fetch headers (immediate), Tier 2 Token Binding (1 month), Tier 3 DECO WASM oracle (deferred)
- `challenge-bound-webauthn` — TLS-binding-derived WebAuthn challenge (version 0x02)
- `signaling-server-auth` — Protocol version negotiation, Prometheus metrics, capability flags
- `dynamic-content-scripts` — Universal `*://*/*` matching with self-destruct
- Proof verification on Android (React Native vault app)

Phase 2B can proceed in parallel with 2A since they affect different layers (extension TLS binding vs Android enclave). Tier 1 requires zero infrastructure and works today.

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
| `react-native-companion-app` | React Native app with native modules; existing Kotlin services wrapped as RN Native Modules. Phase 1 vault (website passwords + Smart-ID PINs) via `react-native-keychain`. V6 enclave integration via JSI TurboModule. | Add NDK enclave integration path; split into `VaultManager.ts` (Phase 1) and `SmartIdPinVault.kt` (V6, via native module) |
| `session-persistence` | WebAuthn PRF for silent re-auth still valid | Keep; WebAuthn PRF used for session resumption on browser restart |
| `signaling-e2ee` | Only relevant for WebRTC fallback path | De-prioritize; AOA transport is inherently encrypted via ECDH+AES |

## Capabilities

### New Capabilities

- `v6-migration-roadmap`: Sequenced transition plan from current WebRTC architecture to V6 USB-AOA architecture
- `transport-abstraction-interface`: Common `Transport` interface unifying WebRTC and USB transport implementations
- `legacy-spec-deprecation-path`: Process for archiving Phase 1 specs when V6 capabilities reach parity

### Modified Capabilities

- All current Phase 1 specs gain a "V6 Replacement" section documenting the superseding V6 component
- `react-native-companion-app` spec gains V6 evolution path: WebRTC RN app → RN + AOA native module → AOA + enclave TurboModule → full V6

## Impact

- **No code changes** — this change produces only specification artifacts
- **docs/ development roadmap**: Updated with V6 phases replacing/extending the current Q4 2026/Q1 2027 roadmap
- **OpenSpec changes**: New changes (usb-aoa-transport-proxy, zktls-context-engine, etc.) are sequenced into the dependency graph
- **ARCHITECTURE.md**: Updated to reflect that V6 is the ultimate target, with current architecture as Phase 1

## V6 Alignment

PHASE 1/1.5/2 (CROSS-PHASE) — This change ensures the project's trajectory is aligned with the V6 end goal across all phases. It does not implement any V6 capability directly but enables coherent sequencing of Phases 1 (RN app), 1.5 (USB bridge), 2A (enclave), 2B (zkTLS), and 2C (QES). Its dependency graph was updated to replace the archived `usb-aoa-transport-proxy` with `native-host-quality-gate` and to add `react-native-companion-app` as a Phase 1 leaf.

## Dependencies

- Blocked on: None (strategic planning artifact)
- Related: ALL V6 changes (this change sequences them)
