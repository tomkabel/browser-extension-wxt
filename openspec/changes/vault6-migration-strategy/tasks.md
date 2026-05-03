## Tasks

### T1 — Update ARCHITECTURE.md V6 positioning [~3h]

- [ ] 1.1 Add an "Architecture Phases" section at the top of `ARCHITECTURE.md` that explicitly lists Phase 1 (current WebRTC), Phase 1.5 (USB bridge), and Phase 2 (V6 ultimate)
- [ ] 1.2 Update the introduction paragraph to state that V6 is the evolution target, not a competing architecture
- [ ] 1.3 Ensure all existing component diagrams retain Phase 1 labels but reference the migration strategy for V6 disposition

### T2 — Define Transport abstraction TypeScript interfaces [~3h]

- [ ] 2.1 Create `lib/transport/types.ts` with `Transport` interface, `TransportConfig`, `TransportStatus`, and a `MessageChannel` abstraction for send/receive
- [ ] 2.2 Define `TransportManager` class skeleton in `lib/transport/manager.ts` with `selectTransport()`, `monitorQuality()`, and `switchTransport()` signatures
- [ ] 2.3 Reference existing WebRTC message types in `types/index.ts` to ensure the new `Transport` interface is compatible with current `ExtensionMessage` shapes

### T3 — Implement TransportManager failover logic [~4h]

- [ ] 3.1 Implement `TransportManager` discovery loop: attempt USB first (with `usbTimeout`), fall back to WebRTC if unavailable
- [ ] 3.2 Create `WebRtcTransport` adapter wrapping existing background WebRTC logic
- [ ] 3.3 Create `UsbTransport` stub that throws `ExtensionError` with `code: 'USB_NOT_IMPLEMENTED'` so the manager automatically falls back
- [ ] 3.4 Wire `withRetry()` from `lib/retry.ts` into the transport selection path

### T4 — Document component retention/replacement table [~2h]

- [ ] 4.1 Transcribe the "Component Retention vs Replacement" table from `design.md` into a new `docs/migration-guide.md` file
- [ ] 4.2 Add a "Migration Path" code-comment column mapping each component to its source directory (e.g., `extension/webrtc-client` → `lib/transport/webrtc-transport.ts`)
- [ ] 4.3 Include a note on which components are strictly Phase-1-only and which are V6-compatible

### T5 — Define phase transition triggers and gating logic [~3h]

- [ ] 5.1 Add `MigrationPhase` and `PhaseGate` types to `types/index.ts` (`'phase1' | 'phase1.5' | 'phase2a' | 'phase2b' | 'phase2c' | 'full-v6'`)
- [ ] 5.2 Store current phase in `chrome.storage.local` under key `migrationPhase`
- [ ] 5.3 Add `phaseGate` utility in `lib/storage.ts` that checks the stored phase against a minimum required phase before enabling a feature flag
- [ ] 5.4 Update popup Zustand store (`entrypoints/popup/store.ts`) to expose `phase` and `setPhase` with user opt-in confirmation

### T6 — Create deprecation policy document [~2h]

- [ ] 6.1 Write a policy document stating: (1) Legacy features are marked in UI, (2) new users default to V6 when available, (3) one-release-cycle grace period, (4) archive specs before code removal
- [ ] 6.2 Reference concrete examples: `emoji-sas-verification` deprecation timeline and `webrtc-client` fallback retention timeline

### T7 — Build V6 change dependency tracker [~3h]

- [ ] 7.1 Create `openspec/changes/vault6-migration-strategy/dependencies.md` listing every V6 change, its blocked-on changes, and its builds-on changes
- [ ] 7.2 Ensure each leaf change (e.g., `usb-aoa-transport-proxy`) has a GitHub issue link placeholder
- [ ] 7.3 Verify that the dependency graph in `design.md` section 3 matches the tracker exactly

### T8 — Draft team communication plan [~2h]

- [ ] 8.1 Add a "Team Communication" section to `docs/migration-guide.md` with: (1) Phase ownership assignments, (2) weekly sync checkpoint topics, (3) escalation path when a V6 change blocks a Phase 1 release
- [ ] 8.2 Include a one-page summary suitable for stakeholder updates, derived from `proposal.md` Migration Phases section
