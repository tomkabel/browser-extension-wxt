# Deprecation Policy — Phase 1 to V6 Migration

This policy governs how Phase 1 components are deprecated as V6 capabilities reach parity.

## Core Principles

### 1. Legacy Features Are Marked in UI
When a V6 capability replaces a Phase 1 feature, the Phase 1 feature is labeled "Legacy" in the extension popup (Settings panel). The legacy label includes:
- The V6 replacement component name
- A link to the migration guide
- The planned removal date (one release cycle after V6 launch)

### 2. New Users Default to V6 When Available
Once a V6 capability reaches stable status:
- New installations default to the V6 implementation
- Existing users see a one-time opt-in prompt to switch
- The Phase 1 implementation remains functional until the deprecation period ends

### 3. One-Release-Cycle Grace Period
After V6 launches for a given capability:
- **Week 0**: V6 ships alongside Phase 1 (dual-mode)
- **Week 1–4**: Phase 1 marked "Legacy" in UI; users prompted to migrate
- **Week 4–8**: Phase 1 code remains but receives no new features or bug fixes
- **Week 8+**: Phase 1 code removed; archived OpenSpec changes preserved for reference

### 4. Archive Specs Before Code Removal
Before removing Phase 1 code:
- The corresponding OpenSpec change is archived with a final status note
- All test suites are preserved as regression tests
- A `docs/archive/` entry documents the removed component and its V6 replacement

---

## Concrete Examples

### `emoji-sas-verification` Deprecation Timeline

| Milestone | Phase | Action |
|-----------|-------|--------|
| **Current** | Phase 1 | Emoji SAS is the primary pairing verification method |
| **Phase 1.5** | USB Bridge | AOA ECDH handshake becomes available; emoji SAS remains default for WebRTC users |
| **Phase 2A** | Core V6 Enclave | Emoji SAS marked "Legacy" in popup; AOA ECDH + WebAuthn passkey is the recommended pairing method |
| **Phase 2A + 4 weeks** | — | Emoji SAS still functional but no new features; legacy warning shown |
| **Phase 2A + 8 weeks** | — | Emoji SAS code removed from extension; `lib/channel/emojiSas.ts` archived; regression tests retained |

**Replacement:** AOA ECDH key exchange (Phase 1.5) + WebAuthn passkey provisioning (Phase 2A)

**Source directories affected:**
- `lib/channel/emojiSas.ts` → archived
- `entrypoints/popup/panels/PairingPanel.tsx` → updated to use AOA ECDH flow

---

### `webrtc-client` Fallback Retention Timeline

| Milestone | Phase | Action |
|-----------|-------|--------|
| **Current** | Phase 1 | WebRTC is the primary and only transport |
| **Phase 1.5** | USB Bridge | USB AOA becomes primary when phone is tethered; WebRTC is automatic fallback |
| **Phase 2A–2C** | V6 Enclave | WebRTC continues as fallback; behind `Transport` abstraction in `lib/transport/` |
| **Full V6** | Complete | WebRTC retained indefinitely as fallback for wireless-only scenarios |

**Key difference:** WebRTC is NOT deprecated — it is retained as a fallback transport. Users who prefer wireless convenience continue using WebRTC. USB is the security-optimized path.

**Source directories affected:**
- `lib/transport/WebRtcTransport.ts` → retained, maintained
- `entrypoints/offscreen-webrtc/` → retained, maintained
- `signaling-server/` → retained for WebRTC signaling

---

## Phase Gate Enforcement

The `phaseGate()` utility in `lib/storage.ts` enforces these transitions at runtime:

```typescript
import { phaseGate } from '~/lib/storage';

// Only enable AOA transport if user has opted into Phase 1.5+
if (phaseGate(currentPhase, { feature: 'usb-transport', minimumPhase: 'phase1.5', description: '...' })) {
  // enable USB transport
}

// Only enable zkTLS if user has opted into Phase 2B+
if (phaseGate(currentPhase, { feature: 'zktls', minimumPhase: 'phase2b', description: '...' })) {
  // enable zkTLS prover
}
```

Each phase transition requires explicit user consent via the extension popup Settings panel.
