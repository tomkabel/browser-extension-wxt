# Comprehensive Quality Analysis Report: `.agents/skills` & `openspec/`

**Project**: SmartID2 — Secure Transaction Verification & Credential Management  
**Date**: 2026-05-04  
**Author**: Senior Systems Architect  
**Scope**: Full audit of `.agents/skills` (71 skill definitions) and `openspec/` (config.yaml, 36 shared specs, 10 active changes, 10 archived changes)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Section A: `.agents/skills` Analysis](#2-section-a-agentsskills-analysis)
   - [A.1 Inventory](#a1-inventory)
   - [A.2 Strengths](#a2-strengths)
   - [A.3 Critical Issues](#a3-critical-issues)
   - [A.4 Skills-to-Project Mapping (Gap Analysis)](#a4-skills-to-project-mapping-gap-analysis)
3. [Section B: `openspec/` Analysis](#3-section-b-openspec-analysis)
   - [B.1 Structural Assessment](#b1-structural-assessment)
   - [B.2 Phase Inventory & Completion Status](#b2-phase-inventory--completion-status)
   - [B.3 Critical Issues](#b3-critical-issues)
   - [B.4 Moderate Issues](#b4-moderate-issues)
   - [B.5 Strengths](#b5-strengths)
   - [B.6 Task Completeness Analysis](#b6-task-completeness-analysis)
4. [Section C: Cross-Cutting Observations](#4-section-c-cross-cutting-observations)
5. [Section D: Recommendations](#5-section-d-recommendations)
6. [Section E: Conclusion](#6-section-e-conclusion)

---

## 1. Executive Summary

The SmartID2 project has an **exceptionally well-structured spec-driven development system** (openspec) with thorough documentation, consistent templates, and clear architectural vision. The Phase 1 (WebRTC-based phone-as-vault) foundations are solid, with 13 archived changes completed and a working prototype.

**However, the V6 vision is over-documented and under-implemented.** Six major V6 components representing approximately 70-80% of the V6 architecture have zero implementation tasks checked (~160 pending tasks total). The zkTLS context engine has an unresolved specification/proposal inconsistency that will block its downstream dependents. The `.agents/skills` have strong breadth but suffer from redundancy (three overlapping WXT skills), missing critical skills (Noise Protocol, WebAuthn PRF, USB AOA), and approximately 1,300 lines of meta-tool guidance irrelevant to implementation.

---

## 2. Section A: `.agents/skills` Analysis

### A.1 Inventory

The directory contains **71 skill definitions** organized into flat per-name directories under `.agents/skills/`, plus a nested hierarchy under `accessibility/accessibility/`. Seven symlinked aliases exist under `.kilocode/skills/`.

### A.2 Strengths

| Strength | Details |
|----------|---------|
| **Broad domain coverage** | Skills span WXT, WebAuthn, WebRTC, Chrome extensions, security threat modeling (STRIDE), accessibility (WCAG), e2e testing (Playwright), TDD, and all 4 programming languages used (TypeScript, Go, Kotlin, C++) |
| **Project-relevant specialized skills** | `webauthn` — applicable to PRF/challenge-bound flows; `webrtc` — applicable to signaling/data channel patterns; `wxt-framework-patterns` (643 lines) — thorough WXT coverage; `chrome-extension-development` — MV3 service workers; `zustand-state-management` — the project's state library |
| **Security depth** | Multiple layered security skills: `security-threat-model` (STRIDE methodology), `security-review` (review checklist), `security-scan` (config scanning), `security-bounty-hunter` (vulnerability hunting), `security-and-hardening`, `secure-headers-csp-builder` |
| **Well-structured references** | `wxt-browser-extensions` has 49 rules across 8 priority-tracked categories with individual reference files per rule |
| **Cross-platform readiness** | Android skills (`android-clean-architecture`, `android-jetpack-compose`, `kotlin-patterns`, `kotlin-testing`, `kotlin-coroutines-flows`, `mobile-android-design`) alongside desktop/Go skills |

### A.3 Critical Issues

#### A.3.1 Redundant Skills with Overlapping Scope

| Skill | Lines | Overlaps With | Severity |
|-------|-------|---------------|----------|
| `wxt/SKILL.md` | 46 | `wxt-framework-patterns` (643 lines) — same topic at 1/14th the depth | **HIGH** |
| `wxt-framework-patterns/SKILL.md` | 643 | `wxt-browser-extensions/SKILL.md` (120 lines) — performance guide vs comprehensive patterns | **HIGH** |
| `wxt-browser-extensions/SKILL.md` | 120 | Both of the above | **HIGH** |
| `accessibility/SKILL.md` (top-level) | 146 | `accessibility/accessibility/SKILL.md` (nested, 439 lines) | **MEDIUM** |
| `playwright/SKILL.md` | 104 | `e2e-testing/SKILL.md` (326 lines) | **MEDIUM** |
| `playwright-generate-test/SKILL.md` | 17 | Both of the above | **LOW** |

**Recommendation**: Consolidate the three WXT skills into a single authoritative reference. `wxt-framework-patterns` (643 lines) should be canonical.

#### A.3.2 Essential Skills Missing for This Project

| Missing Domain | Why Critical |
|----------------|--------------|
| **Noise Protocol implementation** | Core to the project's encryption layer; custom TypeScript implementation and Java/lazysodium counterpart with official test vectors |
| **Chrome MV3 Offscreen Document API** | Required for WebRTC data channel in service worker; lifecycle management is non-trivial |
| **WebAuthn PRF Extension** | The silent-re-auth flow centers on this niche, poorly documented WebAuthn extension |
| **Android KeyStore / KeyGenParameterSpec** | V6 Smart-ID PIN vault relies on `setUserAuthenticationRequired(true)` + `setUnlockedDeviceRequired(true)` — subtle API |
| **USB AOA 2.0 Protocol** | The Go native host and Android AOA transport are core V6 components |
| **Go `crypto/` package patterns** | Go native host uses ECDH, HKDF, AES-GCM — `go` skill (64 lines) and `golang-patterns` are too generic |
| **Android NDK JNI / `mlock` patterns** | Memory-locked enclave with C++ JNI bridge |

#### A.3.3 Meta-Tools Diluting the Skillset

Several skills are meta-tools for LLM orchestration rather than development skills:

| Skill | Lines | Purpose | Assessment |
|-------|-------|---------|------------|
| `context-budget/SKILL.md` | 135 | Audits LLM context window consumption | **Meta-tool** |
| `cost-aware-llm-pipeline/SKILL.md` | 182 | LLM API cost optimization | **Meta-tool** |
| `council/SKILL.md` | 203 | Multi-voice decision-making | **Meta-tool** |
| `verification-loop/SKILL.md` | 126 | Verification system for Claude sessions | **Meta-tool** |
| `knowledge-ops/SKILL.md` | 154 | Knowledge base management | **Peripheral** |
| `full-output-enforcement/SKILL.md` | 49 | Prevents LLM truncation | **Configuration** |
| `santa-method/SKILL.md` | 306 | Multi-agent adversarial verification | **Meta-tool** |
| `search-first/SKILL.md` | 161 | Research-before-coding workflow | **Meta-tool** |

Combined: **~1,316 lines** of meta-tool guidance consuming context budget without directly aiding implementation.

#### A.3.4 Severely Underspecified Skills

| Skill | Lines | Assessment |
|-------|-------|------------|
| `go/SKILL.md` | 64 | Barely more than a YAML header |
| `bun-runtime/SKILL.md` | 84 | Thin overview, no project-specific patterns |
| `tailwindcss/SKILL.md` | 57 | Lacks Tailwind CSS 4 specifics (project uses v4) |
| `design-system/SKILL.md` | 82 | Superficial |
| `playwright-generate-test/SKILL.md` | 17 | Minimal |

#### A.3.5 Outdated References

The `wxt/GENERATION.md` references a submodule at commit `5fe4681620d1bbec35f2c41655c36d29d5693ca7`. The `<source>` path `sources/wxt` does not exist in this repository, making the generation reference non-functional.

### A.4 Skills-to-Project Mapping (Gap Analysis)

| Project Component | Skills Available | Gap Level |
|-------------------|-----------------|-----------|
| WXT Framework | 3 overlapping skills | Redundant, not missing |
| Noise Protocol | None | **CRITICAL GAP** |
| WebAuthn/FIDO2 | `webauthn` (standard only) | Missing PRF extension |
| WebRTC | `webrtc` | Adequate |
| Go Native Host | `go`, `golang-patterns`, `golang-testing` | Adequate but generic |
| Android NDK/C++ | `memory-safety-patterns`, `cpp-coding-standards`, `cpp-testing` | Adequate |
| Android Kotlin | 6 skills | Well-covered |
| AccessibilityService | `accessibility` (web-focused) | Missing Android specifics |
| Security Review | 6 skills | Over-covered |
| USB AOA | None | **CRITICAL GAP** |
| E2E Testing | 3 overlapping skills | Redundant |

---

## 3. Section B: `openspec/` Analysis

### B.1 Structural Assessment

The openspec system follows a well-designed **spec-driven** schema:

```
openspec/
  config.yaml              ← Top-level context, phase definitions, rules
  specs/                   ← 36 reusable spec files (shared across changes)
  changes/
    {active}/              ← 10 active proposals
      .openspec.yaml
      proposal.md
      design.md
      tasks.md
      specs/               ← Change-specific specs
    archive/               ← 10 archived (completed) proposals
```

Each proposal follows a consistent template: **Why → What Changes → Capabilities → Impact → V6 Alignment → Dependencies**. Designs include **Goals/Non-Goals**, **Decisions** (with rationale and alternatives), and **Risks/Trade-offs**. This is excellent engineering discipline.

### B.2 Phase Inventory & Completion Status

#### B.2.1 Archived Changes (Completed)

| Change | Phase | Tasks Status | Quality |
|--------|-------|-------------|---------|
| architectural-security-audit | N/A | 33 tasks, all [x] | **HIGH** |
| architectural-security-remediation | N/A | ~50 tasks, all [x] | **HIGH** |
| extension-ui-panels | Phase 1 | 5 sections, all [x] | **HIGH** |
| fix-domain-detection | Phase 1 | 4 sections, all [x] | **HIGH** |
| fix-tab-domain-detection | Phase 1 | 7 sections (42 tasks), all [x] | **HIGH** |
| implement-complete-testing-infrastructure | N/A | 7 spec files | **MEDIUM** |
| infrastructure-spikes | N/A | 3 spike specs | **HIGH** |
| secure-pairing | Phase 1 | 3 spec files | **HIGH** |
| security-hardening | Phase 1 | 1 spec | **MEDIUM** |
| transaction-protocol | Phase 1 | 1 spec | **HIGH** |
| webauthn-mfa-gate | Phase 1 | 1 spec | **HIGH** |
| usb-aoa-transport-proxy | Phase 1.5 | 5 specs, all [x] | **HIGH** |
| webauthn-prf-silent-reauth | Phase 1 | 5 specs, implemented | **HIGH** |

**Summary**: 13 archived changes extensively completed. Strong Phase 1 foundations.

#### B.2.2 Active Changes (Not Yet Complete)

| Change | Phase | Completion | Assessment |
|--------|-------|-----------|------------|
| android-companion-app | 1/2/3/4 | **~70%** | Core implementation done; V6 tasks unchecked |
| challenge-bound-webauthn | Phase 2 | **0%** | **Not started** |
| eidas-qes-hardware-gate | Phase 2 | **0%** | **Not started** |
| emoji-sas-verification | Phase 1 | **0%** | Overlaps with archived secure-pairing work |
| ghost-actuator-gesture-injection | Phase 2 | **0%** | **Not started** |
| jit-credential-delivery | Phase 1/4 | **~10%** | Few checked |
| ndk-enclave-pin-vault | Phase 2 | **0%** | **Not started** |
| resilient-transport | Phase 2 | **0%** | **Not started** |
| vault6-migration-strategy | Phase 1.5 | **N/A** | Strategy document only (no tasks file) |
| zktls-context-engine | Phase 2 | **~5%** | Spec describes redesigned approach not reflected in proposal |

### B.3 Critical Issues

#### B.3.1 Massive Implementation Gap — 6 V6 Components Are 0% Complete

The following Phase 2 (V6) components have **zero implementation tasks checked**:

1. `challenge-bound-webauthn` (28 tasks)
2. `eidas-qes-hardware-gate` (~20 tasks)
3. `ghost-actuator-gesture-injection` (~20 tasks)
4. `ndk-enclave-pin-vault` (~25 tasks)
5. `resilient-transport` (~15 tasks)
6. `zktls-context-engine` (~15 tasks)

This represents **~70-80% of the V6 architectural scope** with no implementation. The V6 vision is well-documented in `SMARTID_VAULT_v6.md`, `ARCHITECTURE.md`, and the proposals, but the codebase remains Phase 1 only.

#### B.3.2 zkTLS Context Engine — Spec/Proposal Inconsistency (HIGH)

The **specification** (`zktls-context-engine/specs/tlsnotary-wasm-prover/spec.md`) describes a fundamentally different approach from its own **proposal** (`zktls-context-engine/proposal.md`):

| Aspect | Proposal.md (says) | Spec.md (implements) |
|--------|-------------------|---------------------|
| Technology | "WASM TLSNotary MPC prover" | "SmartID-Attestation response header ECDSA P-256 verification" |
| TLS layer | Full TLSNotary MPC protocol | No TLS layer — just HTTP header interception |
| Third-party dependency | Notary server required | None (server sets header) |
| Licensing risk | AGPL from TLSNotary | None (standard ECDSA) |

The spec explicitly states: *"This replaces the TLSNotary WASM MPC prover approach (removed due to: unresolved TLS witness architecture, AGPL licensing risk, Notary server requirement, and WASM binary size)."*

**This is a fundamental architectural redesign not reflected in the proposal.** The proposal's "What Changes" and "Impact" sections still describe TLSNotary. This will cause conflicting implementation efforts, incorrect dependency chains (challenge-bound-webauthn depends on zkTLS proof format), and incompatible Android-side verification logic.

**Severity**: HIGH.

#### B.3.3 Dependency Chains with No Execution

The `vault6-migration-strategy` defines this dependency graph:

```
zktls-context-engine → challenge-bound-webauthn → ndk-enclave-pin-vault → ghost-actuator-gesture-injection → eidas-qes-hardware-gate
```

All nodes in this chain are at **0% completion**. The `vault6-migration-strategy` proposal has no `tasks.md` at all. The entire V6 execution pipeline has no active workstream.

#### B.3.4 Spec Drift in Shared Specs

Multiple files in `openspec/specs/` contain "MODIFIED" annotations for changes from the security audit/remediation that may not have propagated to all referencing proposals:

| Spec | Modification |
|------|-------------|
| `noise-handshake/spec.md` | Remote static key extraction fix + 3-emoji SAS derivation |
| `transaction-flow/spec.md` | `handleIncomingResponse()` wiring + key rotation algorithm |
| `extension-messaging/spec.md` | Flow 4 (real dispatch), Flow 5 (credential request), Flow 6 (PIN authorization) |
| `qr-sas-pairing/spec.md` | Emoji SAS support added |
| `webrtc-signaling/spec.md` | ICE waterfall + TURN credential fetch |

The audit-trail of which modifications have been applied vs. remain pending is unclear.

#### B.3.5 Missing Threat Model for V6 Components

There is **no formal threat model document** for:
- USB AOA transport (new attack surface via libusb)
- NDK enclave JNI boundary (CVE risk in native code)
- WebAuthn passkey provisioning (trust on first use)
- Ghost Actuator `dispatchGesture` (AccessibilityService privilege)
- eIDAS QES gate (Volume Down capture reliability)

The archived `architectural-security-audit` covered Phase 1 only.

#### B.3.6 Missing Integration Specification

The `integration-flow/spec.md` covers Phase 1 flows thoroughly. There is **no end-to-end integration spec for V6**: the full chain of zkTLS → challenge-bound WebAuthn → AOA transport → Android verification → NDK enclave → Ghost Actuator → QES gate. Each component is independently specified, but the sequencing, error handling, and data flow between them is undocumented.

#### B.3.7 Overlap Between Active and Archived Changes

The active `emoji-sas-verification` overlaps with work done in archived `2026-05-01-secure-pairing`. Similarly, `jit-credential-delivery` overlaps with archived `transaction-protocol` and `extension-ui-panels`. Without clear boundaries, there is risk of re-implementing completed work.

### B.4 Moderate Issues

| Issue | Severity | Details |
|-------|----------|---------|
| No regression testing plan for V6 on Phase 1 | MEDIUM | 10 archived changes; V6 modifies same code paths |
| Inconsistent V6 alignment tagging | LOW | "Phase 2" vs "Phase 2A/2B/2C" — config.yaml defines only 3 phases |
| No performance budget | MEDIUM | MV3 constraints (30s SW, offscreen memory, WASM binary size) not specified |
| Rate limiting gaps for V6 paths | MEDIUM | `pin-authorization`, `ghost-actuator retry`, `QES gate timeout` have no rate-limiting specs |
| Hardcoded FCM dependency | LOW | "app requires Google Play Services" — blocks Chinese market |
| wip-plan.md references "Nuxt" | LOW | Copy-paste error from archived testing-infrastructure change |

### B.5 Strengths

| Strength | Evidence |
|----------|----------|
| **Consistent template enforcement** | Every proposal follows the same structure |
| **V6 alignment required by config.yaml** | Every proposal must reference V6 and specify its phase |
| **Dependency documentation** | Explicit blocked-on, builds-on, related declarations |
| **Separated concerns** | One cohesive capability per proposal |
| **Archived change history preserved** | Nothing deleted — full audit trail |
| **Shared spec reuse** | 36 specs in `openspec/specs/` prevent duplication |
| **Decision rationale documented** | Alternatives considered with explicit reasoning |

### B.6 Task Completeness Analysis

| Change | Total Tasks | [x] Done | [ ] Pending | Overall |
|--------|-------------|----------|-------------|---------|
| android-companion-app | ~30 core + 8 V6 | 20 core, 0 V6 | 8 V6 + 3 testing | 70% core done |
| challenge-bound-webauthn | 28 | 0 | 28 | **0%** |
| eidas-qes-hardware-gate | ~20 | 0 | ~20 | **0%** |
| emoji-sas-verification | ~10 | 0 | ~10 | **0%** |
| ghost-actuator-gesture-injection | ~20 | 0 | ~20 | **0%** |
| jit-credential-delivery | ~20 | ~2 | ~18 | **~10%** |
| ndk-enclave-pin-vault | ~25 | 0 | ~25 | **0%** |
| resilient-transport | ~15 | 0 | ~15 | **0%** |
| vault6-migration-strategy | 0 | N/A | N/A | Strategy only |
| zktls-context-engine | ~15 | ~1 | ~14 | **~5%** |

**Total active pending tasks: ~160 tasks.**

---

## 4. Section C: Cross-Cutting Observations

### C.1 Best Practice: Defense-in-Depth Architecture

The layered security model (zkTLS → Challenge-Bound WebAuthn → USB AOA → NDK Enclave → Ghost Actuator → eIDAS QES Gate) is well-architected. Each layer cancels specific attack vectors enumerated in `SMARTID_VAULT_v6.md` §5. The openspec system correctly traces this through individual proposals.

### C.2 Concern: Spec vs. Implementation Fidelity

The archived `architectural-security-remediation` identified a critical bug where the Noise handshake's `remoteStaticPk` was zero-filled. This demonstrates that even well-specced components can have implementation defects. The challenge-bound webauthn and zkTLS changes should incorporate test vectors and interop tests from day one.

### C.3 Concern: Spec-to-Task Granularity Mismatch

The `config.yaml` states: *"Break tasks into chunks of max 4 hours"*. Several tasks in active proposals are multi-day efforts (e.g., "Integration test: full flow from zkTLS proof → challenge derivation → WebAuthn assertion → transport → Android verification"). These should be broken down further.

### C.4 Concern: No CI/CD for Android/Go Components

The archived `ci-cd-pipeline` spec covers the browser extension CI only. The Go native host (cross-compiled for 3 platforms with libusb) and the Android APK have no CI pipeline defined.

---

## 5. Section D: Recommendations

### Priority 1 (Critical)

1. **Resolve zkTLS spec/proposal inconsistency**: Either update the `zktls-context-engine/proposal.md` to reflect the SmartID-Attestation header approach, or revert the spec to the TLSNotary approach. The current mismatch guarantees downstream integration failures.

2. **Establish V6 execution workstream**: With ~160 pending tasks across 6 V6 components all at 0%, assign dedicated ownership to at least the critical path: **NDK Enclave → Ghost Actuator** (parallel tracks) and **zkTLS → Challenge-Bound WebAuthn** (sequential). The `vault6-migration-strategy` needs concrete tasks and milestone dates.

3. **Create integration spec for V6 end-to-end flow**: Document the full chain from content script detection through zkTLS, challenge-bound WebAuthn, AOA transport, Android verification, NDK decryption, Ghost Actuator execution, and QES gate — with explicit data formats, error paths, and timing.

### Priority 2 (High)

4. **Consolidate overlapping skills**: Merge `wxt/`, `wxt-framework-patterns/`, and `wxt-browser-extensions/` into a single canonical WXT skill. Merge top-level `accessibility/` into `accessibility/accessibility/`.

5. **Add missing critical skills**:
   - **Noise Protocol** (XX/IK patterns, test vectors, cipher state management)
   - **Chrome MV3 Offscreen Document** (lifecycle, WebRTC in offscreen)
   - **WebAuthn PRF Extension** (credential creation with PRF, silent mediation)
   - **Android KeyStore KeyGenParameterSpec** (biometric gating, StrongBox, invalidation)
   - **USB AOA 2.0** (libusb control transfers, accessory mode, bulk endpoints)
   - **Android AccessibilityService dispatchGesture** (gesture description, callback monitoring)

6. **Conduct V6-specific threat model**: Apply STRIDE to the six V6 components. Document in a formal threat model artifact.

### Priority 3 (Medium)

7. **Break large tasks into sub-4-hour chunks** across all active proposals.

8. **Add CI/CD for Go native host** (cross-compilation verification) and **Android APK** (build + lint).

9. **Add performance budget spec**: Maximum offscreen document memory, WASM binary size, TURN bandwidth, popup render time.

10. **Establish spec drift tracking**: Add a changelog or version field to shared specs so modifications are traceable.

11. **Demote meta-tool skills** to a separate `.agents/meta/` directory: `context-budget`, `cost-aware-llm-pipeline`, `council`, `verification-loop`, `knowledge-ops`, `full-output-enforcement`, `santa-method`, `search-first`.

### Priority 4 (Low)

12. Update `wxt/GENERATION.md` — remove non-functional `sources/wxt` submodule reference.
13. Expand `go/SKILL.md` and `bun-runtime/SKILL.md` with project-specific patterns.
14. Clean up "nuxt" references in test infrastructure specs.
15. Audit `bun.lock` for `node_modules`-only dependencies vs. project-managed ones.

---

## 6. Section E: Conclusion

The project has an **exceptionally well-structured spec-driven development system** with thorough documentation, consistent templates, and clear architectural vision. The Phase 1 foundations are solid with 13 archived changes completed and a working WebRTC-based phone-as-vault prototype.

However, **the V6 vision is over-documented and under-implemented**. Six major components representing ~70-80% of the V6 architecture have zero implementation. The zkTLS context engine has an unresolved spec/proposal inconsistency that will block its dependent (challenge-bound webauthn). The `.agents/skills` have strong breadth but suffer from redundancy (3 WXT skills), missing critical skills (Noise, PRF, AOA), and inclusion of ~1,300 lines of meta-tool guidance irrelevant to implementation.

The immediate priority should be resolving the zkTLS architectural inconsistency, establishing a concrete V6 execution plan with ownership, and filling the missing skill gaps for the project's core cryptographic and transport protocols.
