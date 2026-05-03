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
              │    ┌──────────────┐                              ▼
              │    │Android Vault │                       ┌──────────────────────┐
              │    │(Phase 1.5)  │                       │  Android Vault (V6)  │
              │    │├─ WebRTC    │                       │  ├─ zkTLS Verifier   │
              │    │├─ AOA       │                       │  ├─ WebAuthn Verifier │
              │    │├─ CredStore │                       │  ├─ Challenge Recomp  │
              │    │└─ Emoji SAS │                       │  ├─ NDK Enclave      │
              │    └──────────────┘                      │  │  (PIN→Coordinate)  │
              │                                          │  ├─ Ghost Actuator   │
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
| `companion-app/cred-vault` | **REFOCUSED** | Stores Smart-ID PINs instead of website passwords |
| `companion-app/emoji-sas` | **DEPRECATED** (V6) | Replaced by AOA ECDH + WebAuthn passkey pairing |
| `companion-app/a11y-bridge` | **REPLACED** | Ghost Actuator replaces generic a11y bridge for Smart-ID |
| `a11y-bridge (standalone)` | **KEPT** | Still useful for general Android automation scenarios |

### 3. Dependency Graph for V6 Changes

```
vault6-migration-strategy (this change)
  │
  ├── usb-aoa-transport-proxy ──────────────┐
  │    (Go Host + AOA 2.0)                   │
  │                                          │
  ├── ndk-enclave-pin-vault ─────────────┐   │
  │    (C++ mlock + coordinate mapper)    │   │
  │                                       │   │
  │    └── ghost-actuator-gesture-injection  │
  │         (dispatchGesture execution)      │
  │                                       │   │
  │         └── eidas-qes-hardware-gate   │   │
  │              (Volume Down QES gate)   │   │
  │                                       │   │
  ├── zktls-context-engine ───────────────┤   │
  │    (WASM TLSNotary prover)            │   │
  │                                       │   │
  │    └── challenge-bound-webauthn ──────┘   │
  │         (SHA256 binding)                  │
  │                                           │
  └───────────────────────────────────────────┘
                         │
                         ▼
                  FULL V6 INTEGRATION
                  ┌─────────────────────┐
                  │ zkTLS → WebAuthn    │
                  │ → AOA → Verify →    │
                  │ Enclave → Actuator  │
                  │ → QES Gate          │
                  └─────────────────────┘
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

The Android companion app similarly has a dual-transport implementation:
- `AoaTransport.kt` — USB AOA transport (primary in Phase 2)
- `WebRtcTransport.kt` — WebRTC transport (fallback)
- `DualTransportManager.kt` — selects and monitors

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

## Risks / Trade-offs

- [Risk] Trying to maintain two transport stacks (USB + WebRTC) doubles testing surface — The transport abstraction limits shared code complexity; each transport is independently testable
- [Risk] USB-only users may lose the wireless convenience of WebRTC — The WebRTC fallback is always available; USB is the security-optimized path, WebRTC is the convenience path
- [Risk] Phase 1 features continue to be requested while V6 is being built — The migration strategy prioritizes Phase 1.5 (bridge) features that are V6-compatible; pure Phase 1 features are lower priority
- [Risk] Team may split focus between two architectures — Assign dedicated owners: Phase 1.5 (USB transport + extension) and Phase 2A (Android enclave) can be parallel tracks with minimal dependency
- [Risk] V6 requires physical USB tethering which is less convenient — USB is for security-critical operations (PIN2/QES); daily PIN1 auth can still use WebRTC convenience
