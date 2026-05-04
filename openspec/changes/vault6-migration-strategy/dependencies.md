# V6 Change Dependency Tracker

All V6-bound OpenSpec changes, their blocking dependencies, reverse dependencies,
and GitHub issue tracking. Generated from design.md §3 dependency graph and
individual change proposals.

---

## Dependency Graph (from design.md §3)

```
usb-aoa-transport-proxy (ARCHIVED — COMPLETED)
  │
  ├── ndk-enclave-pin-vault
  │     │
  │     └── ghost-actuator-gesture-injection
  │           │
  │           └── eidas-qes-hardware-gate
  │
  └── zktls-context-engine
        │
        └── challenge-bound-webauthn
              │
              ├── ndk-enclave-pin-vault (authorizes PIN decryption)
              ├── ghost-actuator-gesture-injection (authorizes actuation)
              └── eidas-qes-hardware-gate (prerequisite: PC biometric)

All leaf paths converge → FULL V6 INTEGRATION
```

## Change Dependency Table

| Change | Status | Blocked-On (must complete first) | Builds-On (foundation) | Blocking (depends on this) |
|---|---|---|---|---|
| `usb-aoa-transport-proxy` | **ARCHIVED — COMPLETED** (74 tasks) | None | None (foundational) | ndk-enclave-pin-vault, zktls-context-engine |
| `ndk-enclave-pin-vault` | ACTIVE | challenge-bound-webauthn (authorization gate) | usb-aoa-transport-proxy (command delivery) | ghost-actuator-gesture-injection (coordinate input), eidas-qes-hardware-gate (PIN2 handling) |
| `ghost-actuator-gesture-injection` | ACTIVE | ndk-enclave-pin-vault (coordinate inputs) | usb-aoa-transport-proxy (payload delivery) | eidas-qes-hardware-gate (actuator suspension target) |
| `zktls-context-engine` | ACTIVE | usb-aoa-transport-proxy (proof delivery to Android) | None (standalone TypeScript) | challenge-bound-webauthn (challenge input) |
| `challenge-bound-webauthn` | ACTIVE | zktls-context-engine (zkTLS proof as challenge input) | usb-aoa-transport-proxy (Android-side verification transport) | ndk-enclave-pin-vault, ghost-actuator-gesture-injection, eidas-qes-hardware-gate (verified intent) |
| `eidas-qes-hardware-gate` | ACTIVE | ghost-actuator-gesture-injection (actuator suspension), ndk-enclave-pin-vault (PIN2 decryption), challenge-bound-webauthn (PC biometric must precede arming) | usb-aoa-transport-proxy (underlying transport) | None (final V6 layer) |

## GitHub Issue Tracking

Each V6 change has a corresponding GitHub issue for tracking progress,
blocking notifications, and cross-linking PRs.

| Change | Issue Link | Status |
|---|---|---|
| `usb-aoa-transport-proxy` | — | ✅ Completed (74 tasks) — issue closed |
| `ndk-enclave-pin-vault` | — | ❌ Issue not yet created — blocked on challenge-bound-webauthn |
| `ghost-actuator-gesture-injection` | — | ❌ Issue not yet created — blocked on ndk-enclave-pin-vault |
| `zktls-context-engine` | — | ❌ Issue not yet created — blocked on usb-aoa-transport-proxy |
| `challenge-bound-webauthn` | — | ❌ Issue not yet created — blocked on zktls-context-engine |
| `eidas-qes-hardware-gate` | — | ❌ Issue not yet created — blocked on prior 3 phases |

**Action**: Create a tracking issue per change when implementation begins.
The issue should link to this dependency tracker for upstream/downstream
blocking context. Use the following naming convention:
- Title: `[V6] <change-name>: <1-line summary>`
- Body: Include the full dependency table row and link to this file.
- Labels: `v6`, `enhancement`

## Phase Mapping

| V6 Phase | Changes | Trigger Condition | Prerequisite Phase |
|---|---|---|---|
| **Phase 1.5** (Bridge) | usb-aoa-transport-proxy (COMPLETED) | Go Native Host binary released | None |
| **Phase 2A** (Core Enclave) | ndk-enclave-pin-vault, ghost-actuator-gesture-injection | NDK enclave + actuator release | 1.5 |
| **Phase 2B** (zkTLS + WebAuthn) | zktls-context-engine, challenge-bound-webauthn | zkTLS prover release | 1.5 (parallel to 2A) |
| **Phase 2C** (eIDAS QES) | eidas-qes-hardware-gate | All prior phases complete | 2A + 2B |

---

## Builds-On / Blocking-on Verification

Per `vault6-migration-strategy/design.md §3`, this tracker MUST match the
dependency graph exactly. The graph above was verified against each change's
`.openspec.yaml` context section and `proposal.md` Dependencies section on
2026-05-04.
