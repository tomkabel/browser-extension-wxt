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

Each V6 change should have a corresponding GitHub issue for tracking progress,
blocking notifications, and cross-linking PRs.

| Change | Issue Link | Status |
|---|---|---|
| `usb-aoa-transport-proxy` | <!-- GH-ISSUE-LINK --> | ✅ Completed (74 tasks) |
| `ndk-enclave-pin-vault` | <!-- GH-ISSUE-LINK --> | ❓ Issue not yet created |
| `ghost-actuator-gesture-injection` | <!-- GH-ISSUE-LINK --> | ❓ Issue not yet created |
| `zktls-context-engine` | <!-- GH-ISSUE-LINK --> | ❓ Issue not yet created |
| `challenge-bound-webauthn` | <!-- GH-ISSUE-LINK --> | ❓ Issue not yet created |
| `eidas-qes-hardware-gate` | <!-- GH-ISSUE-LINK --> | ❓ Issue not yet created |

## Phase Mapping

| V6 Phase | Changes | Trigger Condition |
|---|---|---|
| **Phase 1.5** (Bridge) | usb-aoa-transport-proxy (COMPLETED) | Go Native Host binary released |
| **Phase 2A** (Core Enclave) | ndk-enclave-pin-vault, ghost-actuator-gesture-injection | NDK enclave + actuator release |
| **Phase 2B** (zkTLS + WebAuthn) | zktls-context-engine, challenge-bound-webauthn | zkTLS prover release |
| **Phase 2C** (eIDAS QES) | eidas-qes-hardware-gate | All prior phases complete |

---

## Builds-On / Blocking-on Verification

Per `vault6-migration-strategy/design.md §3`, this tracker MUST match the
dependency graph exactly. The graph above was verified against each change's
`.openspec.yaml` context section and `proposal.md` Dependencies section on
2026-05-04.
