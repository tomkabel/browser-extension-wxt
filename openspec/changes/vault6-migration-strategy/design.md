## Context

The current project builds a WebRTC-based phone-as-vault architecture (Phase 1) described in ARCHITECTURE.md. The V6 specification defines a fundamentally different architecture using USB AOA transport, zkTLS attestation, NDK enclave, and Ghost Actuator. These are not competing architectures — V6 is the evolution of the current approach, enabled by the components built in Phase 1.

This design defines the migration sequence from Phase 1 to V6 (Phase 2), identifying which existing components are kept, which are replaced, and how the transition occurs without breaking ongoing development.

## Goals / Non-Goals

**Goals:**
- Define the phased migration from WebRTC to USB AOA architecture
- Identify which Phase 1 components are retained, adapted, or replaced in V6
- Specify transport abstraction interface for WebRTC ↔ USB coexistence
- Document dependency ordering between V6 changes
- Provide a roadmap for deprecating Phase 1 capabilities when V6 reaches parity
- Update ARCHITECTURE.md to position V6 as the ultimate target

**Non-Goals:**
- Implementation of any V6 component (covered by individual changes)
- Rewriting existing Phase 1 code unnecessarily
- Specifying exact sprint allocations (team scheduling decision)

## Decisions

### 1. Architecture Evolution Diagram

```
PHASE 1 (Current)            PHASE 1.5 (Bridge)           PHASE 2 (V6 Ultimate)
─────────────────            ─────────────────            ─────────────────────
┌──────────────────┐        ┌──────────────────┐         ┌──────────────────────┐
│ Browser Extension│        │ Browser Extension│         │  Browser Extension   │
│ (WXT MV3)        │        │ (WXT MV3)        │         │  (WXT MV3)           │
│ ├─ Content Script│        │ ├─ Content Script│         │  ├─ Content Script    │
│ ├─ WebRTC Client │        │ ├─ Transport Abs.│         │  ├─ zkTLS Prover     │
│ ├─ PRF Re-auth   │        │ ├─ WebRTC Client │         │  ├─ Challenge-Bound  │
│ └─ Popup UI      │        │ ├─ USB Client    │         │  │  WebAuthn         │
└────────┬─────────┘        │ └─ PRF Re-auth   │         │  ├─ Transport Abs.   │
         │                  └────────┬─────────┘         │  │  ├─ USB (primary)  │
    WebRTC Data Channel              │                    │  │  └─ WebRTC (fallbk)│
         │                    ┌──────┴──────┐             │  └─ Popup UI         │
         ▼                    │             │             └──────────┬───────────┘
┌──────────────────┐   USB AOA        WebRTC           USB AOA (primary)
│Go State Controller│   (primary)     (fallback)             │
│ (Cloud Backend)   │     │               │                  ▼
│ ├─ WebRTC Sig.   │     ▼               ▼          ┌──────────────────────┐
│ ├─ TURN Server   │ ┌──────────┐ ┌──────────┐      │  Go Native Host      │
│ ├─ Emulator Mgmt │ │Go Native │ │Go State  │      │  (Desktop-side)      │
│ └─ Session Store │ │Host      │ │Controller│      │  ├─ libusb AOA 2.0   │
└──────────────────┘ │(Desktop) │ │(Cloud)   │      │  ├─ ECDH Key Exchange│
                     │ ├─ libusb│ └──────────┘      │  ├─ AES-256-GCM      │
              ┌──────┤ │ ├─ AOA  │                   │  └─ Native Msg Bridge│
              │      │ │ └─ ECDH │                   └──────────┬───────────┘
              │      └──────────┘                               │
              │           │                               USB AOA 2.0
              │           ▼                                      │
               │    ┌────────────────┐                        ▼
               │    │Android Vault   │                 ┌──────────────────────┐
               │    │(React Native) │                 │  Android Vault (V6)  │
               │    │├─ WebRTC RN   │                 │  ├─ zkTLS Verifier   │
               │    │├─ AOA Native  │                 │  ├─ WebAuthn Verifier │
               │    │├─ CredStore   │                 │  ├─ Challenge Recomp  │
               │    │├─ Emoji SAS   │                 │  ├─ NDK Enclave      │
               │    │└─ GhostBridge │                 │  │  (PIN→Coordinate)  │
               │    └────────────────┘                │  ├─ Ghost Actuator   │
              ▼                                          │  ├─ EIDAS QES Gate  │
     (kept for fallback /                                │  └─ Audit Logger    │
      emulator flows)                                    └──────────────────────┘
```

### 2. Component Retention vs Replacement

| Phase 1 Component | V6 Disposition | Migration Path |
|---|---|---|
| `extension/content-script` | **RETAINED** | Still detects Smart-ID buttons; adds zkTLS-offscreen trigger |
| `extension/webrtc-client` | **FALLBACK** | Kept as secondary transport; behind `Transport` abstraction |
| `extension/prf-reauth` | **RETAINED** | Still valid for session resumption on browser restart |
| `extension/popup-ui` | **RETAINED** | Enhanced with transport status, zkTLS status, QES status |
| `state-controller/cloud` | **KEPT** | Retained for emulator-based v2 flows and WebRTC signaling |
| `state-controller/emulator` | **KEPT** | Retained for v2 Smart-ID emulator fallback |
| `state-controller/webrtc` | **KEPT** | Retained for WebRTC fallback signaling |
| `companion-app/webrtc` | **FALLBACK** | New AOA transport is primary; WebRTC is fallback |
| `react-native-companion-app` | **CURRENT (Phase 1)** | React Native app with native modules; replaces concept of pure-PWA vault |
| `companion-app/cred-vault` | **REFOCUSED** | Stores Smart-ID PINs instead of website passwords; now RN Native Module backed |
| `companion-app/emoji-sas` | **DEPRECATED** (V6) | Replaced by AOA ECDH + WebAuthn passkey pairing |
| `companion-app/a11y-bridge` | **REPLACED** | Ghost Actuator replaces generic a11y bridge for Smart-ID |
| `a11y-bridge (standalone)` | **KEPT** | Still useful for general Android automation scenarios |

### 3. Dependency Graph for V6 Changes

```
vault6-migration-strategy (this change)
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
  └────────────────────────────────────────────┘
                         │
                         ▼
                  FULL V6 INTEGRATION
                  ┌──────────────────────────┐
                  │ zkTLS → WebAuthn → AOA → │
                  │ Verify → Enclave →       │
                  │ Actuator → QES Gate      │
                  └──────────────────────────┘
```

### 4. Transport Abstraction

The extension gains a `Transport` interface that both WebRTC and USB implement:

```typescript
// lib/transport/types.ts
interface TransportConfig {
  preferredTransport: 'usb' | 'webrtc' | 'auto'
  usbTimeout: number    // ms to wait for USB discovery
  webrtcTimeout: number // ms to wait for WebRTC connection
}

interface TransportStatus {
  active: 'usb' | 'webrtc'
  available: ('usb' | 'webrtc')[]
  latency: number
  uptime: number
}

// lib/transport/manager.ts
class TransportManager {
  // Selects best transport based on availability and quality
  async selectTransport(): Promise<Transport>
  // Monitors transport quality and triggers fallback if needed
  async monitorQuality(transport: Transport): Promise<void>
  // Handles transport switching mid-session
  async switchTransport(newTransport: Transport): Promise<void>
}
```

The Android React Native companion app similarly has a dual-transport implementation:
- `AoaTransport` — USB AOA transport via native module (primary in Phase 2)
- `WebRtcTransport` — WebRTC transport via `react-native-webrtc` (fallback)
- `TransportManager.ts` — JS-side selector and monitor

### 5. Phase Transition Triggers

| Phase Transition | Trigger Condition | Key Action |
|---|---|---|
| Phase 1 → 1.5 | USB AOA Go host binary released | Extension auto-detects native host; shows "USB mode available" |
| Phase 1.5 → 2A | NDK enclave + Ghost Actuator release | Android Vault can automate PIN entry; explicit user opt-in required |
| Phase 2A → 2B | zkTLS WASM prover release | Extension enables zkTLS for whitelisted RPs; graceful fallback if proof fails |
| Phase 2B → 2C | eIDAS QES gate release | PIN2 transactions require Volume Down; user education campaign |
| Phase 2C → Full V6 | All components integrated and tested | WebRTC becomes fallback only; USB is default when phone tethered |

Each transition is gated by user explicit consent (opt-in setting) and can be reverted to the previous phase via the extension popup.

### 6. Deprecation Policy

When V6 capabilities reach parity with Phase 1:
1. Mark the Phase 1 capability as "Legacy" in the extension popup
2. Default to V6 implementation for new users
3. Keep Phase 1 code for one release cycle after V6 launch
4. Archive Phase 1 OpenSpec changes after the deprecation period
5. Remove Phase 1 code in the release following archive

## Regression Testing Plan

Before any V6 change is merged, the following regression testing gates MUST pass:

### Baseline Regression (CI Gate)
The `bun run ci:check` command MUST pass before merge. This runs `typecheck → test → build` and validates that no TypeScript, unit/integration, or build errors are introduced.

### Archived Change Coverage Verification
The 15 archived OpenSpec changes represent completed capabilities. Their regression coverage MUST be verified as follows:
- Each archived change's key capabilities map to one or more test files in the extension test suite
- The CI gate (`bun run ci:check`) exercises these tests, but the mapping is not automatic — it depends on test authors covering the archived capabilities
- **Before merging any V6-bound change**, verify that the critical regression paths below are covered by existing tests. If a path has no test coverage, add a test before merging
- The "implicitly covered" claim holds ONLY if the test-to-capability mapping is verified annually or when archived changes are modified

### Critical Regression Paths
The following end-to-end flows MUST be verified on every V6-bound pull request:

1. **Pairing** — QR code generation → WebRTC + E2EE signaling → Noise XX handshake → 3-emoji SAS human verification → paired state persisted in `chrome.storage.session`
2. **Transaction Detection** — Content script on `lhv.ee` detects Smart-ID payment buttons, extracts amount/recipient/reference, and dispatches `detect-transaction` to the background service worker
3. **WebRTC Signaling** — Offscreen document creates offer/answer via cloud signaling server; TURN credentials fetched from `/turn-credentials`; data channel established within 5 seconds
4. **WebAuthn PRF Re-authentication** — Silent session resumption using PRF-derived keypair; no user interaction required; falls back to `chrome.storage.local` when PRF is unavailable
5. **Content Script Domain Detection** — Correct domain parsing for multi-level TLDs (`co.uk`, `com.au`); injection only on `lhv.ee` and `youtube.tomabel.ee`; MutationObserver debounce handles SPA navigation

### Automated Regression Suite
The following command MUST pass in CI before merge:

```bash
bun run ci:check
```

This runs `typecheck → test → build` and validates that no TypeScript, unit/integration, or build errors are introduced.

### Manual Regression Checklist
- [ ] **Transport Abstraction — WebRTC Fallback** — Verify that when the USB AOA native host is unavailable (not installed, no Android device connected, or user disabled USB mode), the extension transparently falls back to WebRTC transport without user-visible error. Confirm this via:
  - Disabling the native host binary (rename or remove from `NativeMessagingHosts` manifest)
  - Attempting a pairing flow from a clean session
  - Confirming the popup shows "Wireless mode" and the WebRTC data channel is established
  - Confirming transaction signing completes successfully over WebRTC

## Risks / Trade-offs

- [Risk] Trying to maintain two transport stacks (USB + WebRTC) doubles testing surface — The transport abstraction limits shared code complexity; each transport is independently testable
- [Risk] USB-only users may lose the wireless convenience of WebRTC — The WebRTC fallback is always available; USB is the security-optimized path, WebRTC is the convenience path
- [Risk] Phase 1 features continue to be requested while V6 is being built — The migration strategy prioritizes Phase 1.5 (bridge) features that are V6-compatible; pure Phase 1 features are lower priority
- [Risk] Team may split focus between two architectures — Assign dedicated owners: Phase 1.5 (USB transport + extension) and Phase 2A (Android enclave) can be parallel tracks with minimal dependency
- [Risk] V6 requires physical USB tethering which is less convenient — USB is for security-critical operations (PIN2/QES); daily PIN1 auth can still use WebRTC convenience
