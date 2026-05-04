## Context

The Android vault is the phone-side component of the SmartID2 architecture. Originally specified as a full native Android app (Kotlin/Java, Gradle, NDK, Play Store), the analysis reveals that a **Progressive Web App (PWA)** can deliver the same core functionality with dramatically lower development and maintenance cost.

Chrome on Android (Android 12+) supports all the APIs needed:
- `navigator.usb` — WebUSB for AOA bulk transfers
- `navigator.credentials.create/get` — WebAuthn for passkeys and PRF
- `navigator.serviceWorker` — Push notifications and background sync
- `crypto.subtle` — AES-256-GCM, ECDSA, HKDF, SHA-256

The only gap is the **Ghost Actuator** (Android AccessibilityService for PIN grid gesture injection), which MUST be native code. This is extracted into a minimal ~200KB APK.

### Architecture

```
┌──────────────────────────────────────────────────┐
│              PWA Vault (TypeScript)                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ WebAuthn │  │ WebUSB   │  │ Noise         │  │
│  │ Passkey  │  │ AOA Bulk │  │ Handshake     │  │
│  │ Manager  │  │ Transport│  │ + Session     │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Credential│  │ Emoji   │  │ Web Push      │  │
│  │ Vault     │  │ SAS      │  │ Notifications │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                    │                              │
│                    ▼                              │
│         ┌──────────────────┐                      │
│         │  Ghost Actuator  │ (minimal native APK) │
│         │  Accessibility   │ ← Local WebSocket    │
│         │  Service         │                      │
│         └──────────────────┘                      │
└──────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- PWA vault as the primary Android vault implementation
- Share TypeScript code with browser extension (Noise, emoji SAS, crypto)
- WebUSB AOA bulk transport (no Go native host needed)
- WebAuthn passkey provisioning and PRF silent re-auth
- AES-256-GCM credential vault via Web Crypto API
- Emoji SAS verification (same derivation as extension)
- Web Push notifications for transaction confirmations
- Minimal ~200KB Ghost Actuator native APK for PIN gesture injection
- Optional Rust WASM core for crypto performance

**Non-Goals:**
- Full native Android app (replaced by PWA)
- Play Store distribution (PWA is URL-served; Ghost APK via GitHub Releases)
- FCM dependency (replaced by Web Push / VAPID)
- Android Keystore (replaced by Web Crypto API)
- Native SQLite (replaced by IndexedDB)
- BLE or NFC transport (WebRTC and WebUSB cover all use cases)

## Decisions

### Decision 1: PWA as Primary Vault

The PWA is served from a URL (e.g., `https://vault.smartid2.app/`) and installed via Chrome's "Add to Home Screen" prompt:

```html
<!-- manifest.json -->
{
  "name": "SmartID2 Vault",
  "short_name": "SmartID2",
  "display": "standalone",
  "scope": "/vault/",
  "start_url": "/vault/",
  "icons": [...],
  "file_handlers": [...]
}
```

The PWA shares the same TypeScript source as the browser extension for Noise protocol, emoji SAS, crypto, and transport:

```
shared/              # Shared between extension and PWA
  channel/
    noise.ts         # Noise XX + IK handshake
    emojiSas.ts      # Emoji SAS derivation
    commandClient.ts # Command protocol
  crypto/
    challengeDerivation.ts
    passkeyProvisioning.ts
pwa/                 # PWA-specific code
  vault/
    main.tsx         # React UI
    webusb.ts        # WebUSB AOA transport
    credentialVault.ts # IndexedDB credential storage
    pushManager.ts   # Web Push notification handler
```

### Decision 2: WebUSB AOA Transport in PWA

The PWA uses `navigator.usb` to communicate with the desktop extension over USB AOA:

```typescript
// PWA connects as USB accessory
async function connectAoa(): Promise<USBDevice> {
  const device = await navigator.usb.requestDevice({
    filters: [{ vendorId: 0x18D1 }] // Google in AOA mode
  });
  await device.open();
  await device.selectConfiguration(1);
  await device.claimInterface(0);
  return device;
}

// Bulk OUT (PWA → desktop)
async function send(data: Uint8Array): Promise<void> {
  await device.transferOut(0x01, data);
}

// Bulk IN (desktop → PWA)
async function receive(): Promise<Uint8Array> {
  const result = await device.transferIn(0x81, 16384);
  return new Uint8Array(result.data!.buffer);
}
```

WebUSB requires a user gesture (button tap) to call `requestDevice()`. The PWA pairing UI includes a "Connect USB" button.

### Decision 3: Ghost Actuator Minimal APK

The Ghost Actuator is a standalone Android AccessibilityService (~200KB APK). It communicates with the PWA via a local WebSocket server on `127.0.0.1`:

```
PWA → localhost:8733 → Ghost Actuator → dispatchGesture(gesture)
```

The PWA sends gesture descriptors:
```json
{
  "gestures": [
    { "x": 0.5, "y": 0.3, "duration": 100, "action": "tap" },
    { "x": 0.5, "y": 0.5, "duration": 50, "action": "tap" }
  ]
}
```

The APK has no UI, no notifications, no network access (binds to `127.0.0.1` only). Installed separately via GitHub Releases or Google Play.

### Decision 4: Credential Vault in IndexedDB

The PWA stores encrypted credentials in IndexedDB:

```typescript
interface CredentialRecord {
  domain: string;
  username: string;       // Plaintext (for display)
  ciphertext: ArrayBuffer; // AES-256-GCM encrypted password
  iv: Uint8Array;          // 12-byte IV
  created_at: number;
  updated_at: number;
}
```

Encryption key: derived from WebAuthn PRF output (biometric-bound). The key is NOT stored — it's derived on each access via PRF evaluation.

### Decision 5: Web Push Notifications

The PWA registers a service worker with Web Push (VAPID):

```typescript
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicVapidKey,
});
```

The subscription endpoint is sent to the extension during pairing. The extension uses it to send transaction approval notifications via the Web Push API (no FCM dependency).

### Decision 6: Shared Noise Protocol

Both the extension and PWA use the exact same Noise protocol implementation from `lib/channel/noise.ts`. This is critical for interop — the same salty-crypto library runs in both service worker (extension) and browser tab (PWA) contexts.

### Decision 7: Optional Rust WASM Core

For performance-critical crypto (Noise handshake, challenge verification), the shared TypeScript can be replaced with Rust compiled to WASM:

```rust
// vault-core/src/lib.rs
#[wasm_bindgen]
pub fn noise_xx_handshake(local_sk: &[u8], remote_pk: &[u8]) -> Vec<u8> { ... }
#[wasm_bindgen]
pub fn derive_challenge(proof: &[u8], origin: &str, code: &str) -> Vec<u8> { ... }
```

Compiled with `wasm-pack` for PWA, and with `aarch64-linux-android` for NDK native. One Rust codebase, two targets. This is OPTIONAL — the TypeScript implementation is sufficient for Phase 1.

## Risks / Trade-offs

- [Risk] WebUSB requires user gesture and device selection — The user must tap "Connect" and select the desktop device from the browser prompt. This is a one-time action during pairing.
- [Risk] PWA may be cleared from browser storage (cache eviction) — Credentials stored in IndexedDB persist until explicitly cleared. The PWA manifest includes full page persistence guidance.
- [Risk] Android Chrome may not support all Web Crypto API operations — AES-256-GCM, ECDSA, and HKDF are supported since Chrome 80+. PRF extension requires Chrome 110+.
- [Risk] Ghost Actuator requires Accessibility Service permission — Users must enable it in Settings. The setup wizard guides this step. If unavailable, fall back to manual PIN entry on the phone screen.
- [Risk] Web Push delivery is not guaranteed — The browser's push service (FCM, or alternative) may delay or drop messages. The extension retries with exponential backoff and falls back to polling if push fails repeatedly.
- [Trade-off] PWA vs native app — PWA eliminates NDK, Gradle, Play Store, and native build complexity. The trade-off is dependency on Chrome's WebUSB and WebAuthn implementations. These are stable APIs with strong Chrome on Android support.
