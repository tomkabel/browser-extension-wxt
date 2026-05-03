## Tasks

### T1 — Update ARCHITECTURE.md V6 positioning [~3h]
- Source: `ARCHITECTURE.md`, `SMARTID_VAULT_v6.md`
- Add an "Architecture Phases" section at the top of `ARCHITECTURE.md` that explicitly lists Phase 1 (current WebRTC), Phase 1.5 (USB bridge), and Phase 2 (V6 ultimate).
- Update the introduction paragraph to state that V6 is the evolution target, not a competing architecture.
- Ensure all existing component diagrams retain Phase 1 labels but reference the migration strategy for V6 disposition.

### T2 — Define Transport abstraction TypeScript interfaces [~3h]
- Source: `lib/transport/types.ts` (new), `lib/transport/manager.ts` (new), `entrypoints/background/webrtc.ts`, `types/index.ts`
- Create `lib/transport/types.ts` with `Transport` interface, `TransportConfig`, `TransportStatus`, and a `MessageChannel` abstraction for send/receive.
- Define `TransportManager` class skeleton in `lib/transport/manager.ts` with `selectTransport()`, `monitorQuality()`, and `switchTransport()` signatures.
- Reference existing WebRTC message types in `types/index.ts` to ensure the new `Transport` interface is compatible with current `ExtensionMessage` shapes.

### T3 — Implement TransportManager failover logic [~4h]
- Source: `lib/transport/manager.ts`, `lib/transport/webrtc-transport.ts` (new), `lib/transport/usb-transport.ts` (new / stub), `lib/retry.ts`
- Implement `TransportManager` discovery loop: attempt USB first (with `usbTimeout`), fall back to WebRTC if unavailable.
- Create `WebRtcTransport` adapter wrapping existing background WebRTC logic.
- Create `UsbTransport` stub that throws `ExtensionError` with `code: 'USB_NOT_IMPLEMENTED'` so the manager automatically falls back.
- Wire `withRetry()` from `lib/retry.ts` into the transport selection path.

### T4 — Document component retention/replacement table [~2h]
- Source: `docs/migration-guide.md` (new), `openspec/changes/vault6-migration-strategy/design.md`
- Transcribe the "Component Retention vs Replacement" table from `design.md` into a new `docs/migration-guide.md` file.
- Add a "Migration Path" code-comment column mapping each component to its source directory (e.g., `extension/webrtc-client` → `lib/transport/webrtc-transport.ts`).
- Include a note on which components are strictly Phase-1-only and which are V6-compatible.

### T5 — Define phase transition triggers and gating logic [~3h]
- Source: `lib/storage.ts`, `entrypoints/popup/store.ts`, `types/index.ts`
- Add `MigrationPhase` and `PhaseGate` types to `types/index.ts` (`'phase1' | 'phase1.5' | 'phase2a' | 'phase2b' | 'phase2c' | 'full-v6'`).
- Store current phase in `chrome.storage.local` under key `migrationPhase`.
- Add `phaseGate` utility in `lib/storage.ts` that checks the stored phase against a minimum required phase before enabling a feature flag.
- Update popup Zustand store (`entrypoints/popup/store.ts`) to expose `phase` and `setPhase` with user opt-in confirmation.

### T6 — Create deprecation policy document [~2h]
- Source: `docs/deprecation-policy.md` (new), `docs/migration-guide.md`
- Write a policy document stating: (1) Legacy features are marked in UI, (2) new users default to V6 when available, (3) one-release-cycle grace period, (4) archive specs before code removal.
- Reference concrete examples: `emoji-sas-verification` deprecation timeline and `webrtc-client` fallback retention timeline.

### T7 — Build V6 change dependency tracker [~3h]
- Source: `openspec/changes/vault6-migration-strategy/design.md`, `.github/project-config.json` (if present)
- Create `openspec/changes/vault6-migration-strategy/dependencies.md` listing every V6 change, its blocked-on changes, and its builds-on changes.
- Ensure each leaf change (e.g., `usb-aoa-transport-proxy`) has a GitHub issue link placeholder.
- Verify that the dependency graph in `design.md` section 3 matches the tracker exactly.

### T8 — Draft team communication plan [~2h]
- Source: `docs/migration-guide.md`, `docs/deprecation-policy.md`, `openspec/changes/vault6-migration-strategy/proposal.md`
- Add a "Team Communication" section to `docs/migration-guide.md` with: (1) Phase ownership assignments, (2) weekly sync checkpoint topics, (3) escalation path when a V6 change blocks a Phase 1 release.
- Include a one-page summary suitable for stakeholder updates, derived from `proposal.md` Migration Phases section.
