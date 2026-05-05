# V6 Migration Guide

This document tracks the migration from Phase 1 (WebRTC phone-as-vault) to Full V6 (USB-AOA architecture). It maps every existing component to its V6 disposition and provides a migration path for each.

## Component Retention vs Replacement

| Phase 1 Component | V6 Disposition | Source Directory | V6 Target | Migration Path | Phase Scope |
|---|---|---|---|---|---|
| `extension/content-script` | **RETAINED** | `entrypoints/content/` | `entrypoints/content/` | Still detects Smart-ID buttons; adds zkTLS-offscreen trigger | V6-compatible |
| `extension/webrtc-client` | **FALLBACK** | `entrypoints/offscreen-webrtc/` | `lib/transport/WebRtcTransport.ts` | Kept as secondary transport; behind `Transport` abstraction | V6-compatible (fallback) |
| `extension/prf-reauth` | **RETAINED** | `lib/crypto/`, `lib/webauthn/` | `lib/crypto/`, `lib/webauthn/` | Still valid for session resumption on browser restart | V6-compatible |
| `extension/popup-ui` | **RETAINED** | `entrypoints/popup/` | `entrypoints/popup/` | Enhanced with transport status, zkTLS status, QES status | V6-compatible |
| `extension/transport-abstraction` | **NEW** | `lib/transport/` | `lib/transport/` | New in Phase 1.5; unifies WebRTC and USB transports | V6-compatible |
| `state-controller/cloud` | **KEPT** | `signaling-server/` | `signaling-server/` | Retained for emulator-based v2 flows and WebRTC signaling | Phase 1 only (signaling) |
| `state-controller/emulator` | **KEPT** | External | External | Retained for v2 Smart-ID emulator fallback | Phase 1 only |
| `state-controller/webrtc` | **KEPT** | `signaling-server/` | `signaling-server/` | Retained for WebRTC fallback signaling | Phase 1 only (signaling) |
| `companion-app/webrtc` | **FALLBACK** | Android app | Android app | New AOA transport is primary; WebRTC is fallback | V6-compatible (fallback) |
| `companion-app/cred-vault` | **REFOCUSED** | Android app | Android app | Stores Smart-ID PINs instead of website passwords | V6-compatible |
| `companion-app/emoji-sas` | **DEPRECATED** (V6) | Android app | N/A | Replaced by AOA ECDH + WebAuthn passkey pairing | Phase 1 only |
| `companion-app/a11y-bridge` | **REPLACED** | Android app | Ghost Actuator | Ghost Actuator replaces generic a11y bridge for Smart-ID | Phase 1 only |
| `a11y-bridge (standalone)` | **KEPT** | Android app | Android app | Still useful for general Android automation scenarios | V6-compatible |
| `emoji-sas-verification` | **DEPRECATED** (V6) | `lib/channel/` | N/A | Replaced by AOA ECDH + WebAuthn passkey pairing | Phase 1 only |
| `webrtc-signaling` | **KEPT** | `entrypoints/offscreen-webrtc/` | `entrypoints/offscreen-webrtc/` | Retained as fallback signaling path | V6-compatible (fallback) |
| `jit-credential-delivery` | **PHASE 1 ONLY** | Background handlers | N/A | Phase 1 website password manager; V6 PINs use NDK enclave | Phase 1 only |

## Migration Path — Code Directory Mapping

Each Phase 1 component maps to its V6 target directory:

```
extension/content-script     → entrypoints/content/          (RETAINED, enhanced)
extension/webrtc-client      → lib/transport/WebRtcTransport.ts  (FALLBACK)
extension/usb-client         → lib/transport/UsbTransport.ts     (NEW, Phase 1.5)
extension/transport-mgr      → lib/transport/TransportManager.ts (NEW, Phase 1.5)
extension/prf-reauth         → lib/crypto/ + lib/webauthn/      (RETAINED)
extension/popup-ui           → entrypoints/popup/                (RETAINED, enhanced)
extension/emoji-sas          → lib/channel/                      (DEPRECATED in V6)
state-controller/cloud       → signaling-server/                 (KEPT for signaling)
companion-app/webrtc         → Android app WebRtcTransport.kt   (FALLBACK)
companion-app/aoa            → Android app AoaTransport.kt      (NEW, Phase 1.5)
companion-app/cred-vault     → Android app SmartIdPinVault.kt   (REFOCUSED)
companion-app/emoji-sas      → N/A                               (DEPRECATED)
companion-app/a11y-bridge    → Ghost Actuator                    (REPLACED)
```

## Phase-1-Only Components

The following components are strictly Phase 1 and will be deprecated when V6 reaches parity:

1. **`emoji-sas-verification`** — Replaced by AOA ECDH handshake + WebAuthn passkey. Deprecation timeline: Phase 2A (when NDK enclave ships).
2. **`companion-app/a11y-bridge`** — Replaced by Ghost Actuator `dispatchGesture()`. Deprecation timeline: Phase 2A.
3. **`companion-app/emoji-sas`** — Replaced by AOA ECDH pairing. Deprecation timeline: Phase 1.5 (when USB transport becomes primary).
4. **`jit-credential-delivery`** — Phase 1 website password manager. V6 Smart-ID PINs use NDK enclave (local decrypt, coordinate output), not the credential request protocol. Deprecation timeline: Phase 2A.

## V6-Compatible Components

These components survive the full migration and are enhanced, not replaced:

1. **`extension/content-script`** — Continues detecting Smart-ID buttons; gains zkTLS offscreen trigger in Phase 2B.
2. **`extension/webrtc-client`** — Becomes fallback transport behind the `Transport` abstraction.
3. **`extension/prf-reauth`** — WebAuthn PRF for silent session resumption remains valid across all phases.
4. **`extension/popup-ui`** — Enhanced with transport status indicator, zkTLS proof status, and QES gate status.
5. **`a11y-bridge (standalone)`** — General-purpose Android automation; orthogonal to Smart-ID-specific Ghost Actuator.

---

## Team Communication

### Phase Ownership

| Phase | Owner(s) | Scope |
|-------|----------|-------|
| **Phase 1** (WebRTC + WebUSB) | Extension team | Content scripts, WebRTC signaling, popup UI, transport abstraction |
| **Phase 1.5** (USB Bridge) | Extension + Go team | Go Native Host AOA shim, UsbTransport adapter, ECDH key exchange |
| **Phase 2A** (Core V6 Enclave) | Android team | NDK enclave, Ghost Actuator, Shamir recovery, multi-device revocation |
| **Phase 2B** (TLS Binding + WebAuthn) | Extension + Crypto team | zkTLS prover, challenge-bound WebAuthn, dynamic content scripts |
| **Phase 2C** (eIDAS QES) | Android + Compliance team | Volume Down QES gate, audit trail, overlay UI |

### Weekly Sync Checkpoint Topics

1. **Transport status** — Is USB AOA stable? WebRTC fallback working? Any failover regressions?
2. **Phase gate readiness** — Are the trigger conditions for the next phase transition met?
3. **Blocked changes** — Any V6 changes blocked by incomplete dependencies?
4. **Regression suite** — Is `bun run ci:check` passing on all V6-bound PRs?
5. **User opt-in metrics** — How many users have opted into the next migration phase?

### Escalation Path

When a V6 change blocks a Phase 1 release:

1. **Identify the blocker** — Which V6 change is causing the conflict? Document in the relevant OpenSpec change.
2. **Assess blast radius** — Does the blocker affect Phase 1 users, or only V6 opt-in users?
3. **Apply the fallback rule** — If the blocker only affects V6 features, disable the V6 feature behind `phaseGate()` and proceed with the Phase 1 release.
4. **If the blocker affects Phase 1** — Escalate to the phase owner. Options:
   - Revert the V6 change
   - Feature-flag the V6 change behind `phaseGate()` with `minimumPhase: 'phase2a'` (or higher)
   - Hotfix the Phase 1 regression without reverting (preferred if scope is small)
5. **Post-mortem** — Document the incident in the relevant OpenSpec change and update the regression test suite.

---

## Stakeholder Summary — V6 Migration at a Glance

### What is V6?

V6 (SMARTID_VAULT_v6) is the evolution of Smart-ID's phone-as-vault architecture. It replaces the current WebRTC-based cloud signaling with a direct USB connection between the browser extension and the Android phone, adds zero-knowledge TLS attestation to defeat RATs, and uses an NDK memory-locked enclave to process PINs without exposing them to the Android JVM.

### Why migrate?

| Problem (Phase 1) | Solution (V6) |
|---|---|
| WebRTC requires cloud signaling server | USB AOA is direct device-to-device — no cloud dependency |
| PINs processed in Android JVM (GC-leakable) | NDK C++ enclave with `mlock` + `explicit_bzero` |
| No network truth verification | zkTLS proves the bank's TLS certificate signed the transaction |
| Emoji SAS is convenient but not phishing-resistant | Challenge-bound WebAuthn cryptographically binds to the transaction |
| No eIDAS QES compliance | Volume Down hardware gate provides "sole control" for QES |

### Migration Phases

| Phase | Timeline | What Ships |
|-------|----------|------------|
| **Phase 1** | Now – 6 weeks | QR pairing, WebRTC transport, emoji SAS, credential delivery |
| **Phase 1.5** | +4–6 weeks | USB AOA transport (primary), WebRTC becomes fallback, Go host AOA shim |
| **Phase 2A** | +8–10 weeks | Android Vault PWA, NDK PIN enclave, Ghost Actuator, Shamir recovery |
| **Phase 2B** | +8–10 weeks (parallel with 2A) | zkTLS attestation, challenge-bound WebAuthn, dynamic content scripts |
| **Phase 2C** | +4–6 weeks | eIDAS QES hardware gate, audit trail, overlay UI |
| **Full V6** | ~6–9 months total | USB default, WebRTC fallback, all components integrated |

### Key Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Two transport stacks double testing surface | Transport abstraction isolates each transport; independently testable |
| USB-only loses wireless convenience | WebRTC always available as fallback; USB is the security path |
| Team splits focus between architectures | Dedicated owners per phase; Phase 1.5 and 2A can run in parallel |
| V6 requires physical USB tethering | USB for PIN2/QES (security-critical); WebRTC for daily PIN1 (convenience) |
