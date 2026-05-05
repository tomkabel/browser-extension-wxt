# V6 Change Dependency Tracker

All V6-bound OpenSpec changes, their blocking dependencies, reverse dependencies,
and GitHub issue tracking. Generated from design.md §3 dependency graph and
individual change proposals.

---

## Dependency Graph (from design.md §3)

```
vault6-migration-strategy (this change — strategic planning)
  │
  ├── react-native-companion-app (PHASE 1) ──────┐
  │    (RN app: WebRTC, Noise responder,          │
  │     credential vault, Ghost bridge)            │
  │                                                │
  ├── native-host-quality-gate (PHASE 1.5) ───────┤
  │    (replaces archived usb-aoa-transport-proxy; │
  │     Go AOA shim + WebUSB transport)            │
  │                                                │
  ├── ndk-enclave-pin-vault (PHASE 2A) ──────┐    │
  │    (C++ mlock + coordinate mapper)        │    │
  │                                           │    │
  │    └── ghost-actuator-gesture-injection   │    │
  │         (dispatchGesture execution)       │    │
  │         [Phase 1: coordinates from RN JS] │    │
  │         [Phase 2A: coordinates from NDK]  │    │
  │                                           │    │
  │         └── eidas-qes-hardware-gate       │    │
  │              (Volume Down QES gate)       │    │
  │                                           │    │
  ├── zktls-context-engine (PHASE 2B) ───────┤    │
  │    (Signed-Header Attestation Engine)     │    │
  │                                           │    │
  │    └── challenge-bound-webauthn (PHASE 2B)│    │
  │         (SHA-256 binding)                 │    │
  │                                           │    │
  └─────────────────────────────────────────────┘
                         │
                         ▼
                  FULL V6 INTEGRATION
                  ┌──────────────────────────┐
                  │ zkTLS → WebAuthn → AOA → │
                  │ Verify → Enclave →       │
                  │ Actuator → QES Gate      │
                  └──────────────────────────┘
```

## Change Dependency Table

| Change | Status | Phase | Blocked-On | Builds-On | Blocking |
|---|---|---|---|---|---|---|
| `vault6-migration-strategy` | ACTIVE (living document) | Cross-phase | None | None | All changes (sequences them) |
| `react-native-companion-app` | ACTIVE (46/69 tasks) | **Phase 1** | None | jit-credential-delivery (protocol def), webrtc-datachannel-reliability, vault6-migration-strategy | None yet |
| `native-host-quality-gate` | ACTIVE (24/28 tasks) | **Phase 1.5** | None | None (replaces archived usb-aoa-transport-proxy) | ndk-enclave-pin-vault (transport for verified payload) |
| `ndk-enclave-pin-vault` | COMPLETE (42 tasks) | **Phase 2A** | challenge-bound-webauthn (authorisation gate) | native-host-quality-gate (command delivery) | ghost-actuator-gesture-injection (Phase 2A coordinate source) |
| `ghost-actuator-gesture-injection` | ACTIVE (27/28 tasks) | **Phase 1/2A** | None for Phase 1 (RN JS provides coordinates); Blocked on ndk-enclave-pin-vault for Phase 2A | react-native-companion-app (Phase 1 RN bridge), native-host-quality-gate (command transport) | eidas-qes-hardware-gate (actuator suspension target) |
| `zktls-context-engine` | ACTIVE (29/62 tasks) | Phase 2B | native-host-quality-gate (proof delivery to Android) | None | challenge-bound-webauthn (challenge input) |
| `challenge-bound-webauthn` | ACTIVE (41/61 tasks) | Phase 2B | zktls-context-engine (zkTLS proof as challenge input) | native-host-quality-gate (Android-side verification transport) | ndk-enclave-pin-vault, eidas-qes-hardware-gate (verified intent) |
| `eidas-qes-hardware-gate` | ACTIVE (0/39 tasks) | Phase 2C | ghost-actuator-gesture-injection (actuator suspension), ndk-enclave-pin-vault (PIN2 decryption), challenge-bound-webauthn | native-host-quality-gate (underlying transport) | None (final V6 layer) |

## GitHub Issue Tracking

Each V6 change has a corresponding GitHub issue for tracking progress,
blocking notifications, and cross-linking PRs.

| Change | Issue Link | Status |
|---|---|---|
| `vault6-migration-strategy` | [link](https://github.com/ORG/REPO/issues/TBD) | In progress — this change |
| `usb-aoa-transport-proxy` | — | ✅ Completed (74 tasks) — issue closed |
| `ndk-enclave-pin-vault` | — | ✅ Completed (42 tasks) — issue closed |
| `ghost-actuator-gesture-injection` | [link](https://github.com/ORG/REPO/issues/TBD) | ❌ Issue not yet created |
| `zktls-context-engine` | [link](https://github.com/ORG/REPO/issues/TBD) | ❌ Issue not yet created |
| `challenge-bound-webauthn` | [link](https://github.com/ORG/REPO/issues/TBD) | ❌ Issue not yet created |
| `eidas-qes-hardware-gate` | [link](https://github.com/ORG/REPO/issues/TBD) | ❌ Issue not yet created |

**Action**: Create a tracking issue per change when implementation begins.
The issue should link to this dependency tracker for upstream/downstream
blocking context. Use the following naming convention:
- Title: `[V6] <change-name>: <1-line summary>`
- Body: Include the full dependency table row and link to this file.
- Labels: `v6`, `enhancement`

## Phase Mapping

| V6 Phase | Changes | Trigger Condition | Prerequisite Phase |
|---|---|---|---|
| **Phase 1.5** (Bridge) | usb-aoa-transport-proxy (COMPLETED), vault6-migration-strategy | Go Native Host binary released | None |
| **Phase 2A** (Core Enclave) | ndk-enclave-pin-vault (COMPLETED), ghost-actuator-gesture-injection | NDK enclave + actuator release | 1.5 |
| **Phase 2B** (zkTLS + WebAuthn) | zktls-context-engine, challenge-bound-webauthn | zkTLS prover release | 1.5 (parallel to 2A) |
| **Phase 2C** (eIDAS QES) | eidas-qes-hardware-gate | All prior phases complete | 2A + 2B |

## Supporting Changes (Phase 1 / Infrastructure)

These are not on the V6 critical path but support the migration:

| Change | Phase | Relation to V6 | Status |
|--------|-------|----------------|--------|
| `resilient-transport` | 1 | QR-embedded SDP, static TURN, event-driven USB — Phase 1.5 prerequisites | `in-progress` (30/32) |
| `native-host-quality-gate` | 1 | WebUSB transport, Go host → AOA shim — Phase 1.5 prerequisite | `in-progress` (0/28) |
| `dynamic-content-scripts` | 2B | Universal `*://*/*` matching with self-destruct | `in-progress` (21/23) |
| `popup-accessibility` | 1 | Accessibility improvements for popup UI | `in-progress` (28/30) |
| `performance-benchmarks` | 1 | Baseline performance measurements | `in-progress` (0/23) |
| `prf-cross-browser-fallback` | 1 | WebAuthn PRF cross-browser support | `in-progress` (0/17) |
| `vault-encryption-recovery` | 2A | Shamir 2-of-3 recovery, Merkle tree revocation | `in-progress` (0/58) |
| `multi-device-revocation` | 2A | Device registry, device switching, signed revocation | `in-progress` (0/26) |
| `jit-credential-delivery` | 1 | Website password manager — Phase 1 only, orthogonal to V6 PINs | `in-progress` (31/40) |
| `signaling-server-auth` | 1 | Protocol version negotiation, Prometheus metrics | `complete` (15/15) |
| `webrtc-datachannel-reliability` | 1 | Data channel reliability improvements | `complete` (27/27) |
| `fix-webauthn-library` | 1 | WebAuthn library fixes | `complete` (15/15) |

## Build Order

The minimal critical path for Full V6:

```
1. vault6-migration-strategy  ← YOU ARE HERE
2. usb-aoa-transport-proxy    (Phase 1.5 — COMPLETED)
3. ndk-enclave-pin-vault       (Phase 2A — COMPLETED)
4. zktls-context-engine        (Phase 2B — in progress, parallel with 5)
5. ghost-actuator-gesture-injection (Phase 2A — depends on 3)
6. challenge-bound-webauthn    (Phase 2B — depends on 4)
7. eidas-qes-hardware-gate     (Phase 2C — depends on 5 + 6)
```

Steps 4–5 can proceed in parallel. Step 6 depends on 4. Step 7 depends on both 5 and 6.

---

## Builds-On / Blocking-on Verification

Per `vault6-migration-strategy/design.md §3`, this tracker MUST match the
dependency graph exactly. The graph above was verified against each change's
`.openspec.yaml` context section and `proposal.md` Dependencies section on
2026-05-04.
