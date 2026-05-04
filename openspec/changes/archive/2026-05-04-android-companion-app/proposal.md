## Why

The Android companion app is currently specified as a full native Android app with Kotlin/Java, Gradle build system, and Google Play Store distribution. Building and maintaining a native Android app is a massive undertaking: NDK, signing, Play Store review cycles, multiple form factors, API level compatibility.

However, the critical vault functionality does not require a native app. Chrome on Android (Android 12+) supports:

1. **WebUSB API** (`navigator.usb`) — for USB AOA bulk communication
2. **WebAuthn** (`navigator.credentials.create/get`) — for passkey provisioning and PRF
3. **Push notifications** — via Firebase Web Push / Service Worker
4. **PWA install** — `display: standalone` manifest for full-screen app experience

A Progressive Web App (PWA) vault can deliver the same core functionality as a native app with dramatically lower development cost:
- One TypeScript codebase shared with the browser extension
- No native build toolchain (no Gradle, no Kotlin, no NDK)
- Auto-updates via service worker (no Play Store review)
- Same Noise protocol implementation as the extension
- WebUSB for AOA communication (no Go native host needed on desktop either)

## What Changes

- **PWA vault (primary)**: A Progressive Web App served from the phone's Chrome browser, installed via "Add to Home Screen". Implements: WebAuthn passkey management, WebUSB AOA bulk transport, Noise protocol handshake, emoji SAS verification, credential vault (AES-256-GCM via Web Crypto API).
- **Native service (only for Ghost Actuator)**: A ~200KB minimal APK implementing only the Android AccessibilityService for PIN grid gesture injection. This is the ONLY component requiring native code. Communicates with the PWA via Android Messenger IPC or local WebSocket on 127.0.0.1.
- **PWA manifest**: `display: standalone`, `scope: /vault/`, with icon resources for home screen installation.
- **Service Worker**: Handles push notifications, background sync, and offline credential caching.
- **Rust WASM core** (optional, Phase 2): Compile the Noise protocol and challenge verification to WebAssembly using `wasm-pack`. Same Rust code can target WASM (browser) and NDK (Android native) using `wasm32-unknown-unknown` and `aarch64-linux-android` targets.

## Capabilities

### New Capabilities

- `pwa-vault`: Progressive Web App vault for Android — WebAuthn, WebUSB, Noise, credential storage
- `ghost-actuator-native`: ~200KB minimal APK for AccessibilityService PIN gesture injection only
- `wasm-core`: Rust WASM module for Noise protocol and crypto (shared between PWA and native)

### Modified Capabilities

- Existing `Android Keystore` encryption → replaced by Web Crypto API (`crypto.subtle`) in the PWA
- Existing `FCM push` → replaced by Web Push API (standard, no Firebase dependency)
- Existing `native Android UI` → replaced by PWA React/TypeScript UI

## Impact

- **Android vault codebase**: From ~5000 lines Kotlin/Java to ~1500 lines TypeScript shared with extension. The PWA shares `lib/channel/noise.ts`, `lib/channel/emojiSas.ts`, `lib/crypto/*` with the extension.
- **Native code**: Reduced from full Android app to ~200KB APK (Ghost Actuator only). No NDK, no Gradle, no Play Store review for the PWA.
- **Build system**: PWA built with same Vite/WXT pipeline as the extension. Rust WASM build via `wasm-pack` (optional, Phase 2).
- **Distribution**: PWA is served from a URL; user installs via "Add to Home Screen". Ghost Actuator APK distributed via GitHub Releases (or Google Play if desired).
- **WebUSB requirement**: Chrome on Android 12+ supports WebUSB. For older Android, fall back to WebRTC (no USB AOA — slower, but functional).

## Dependencies

- WebUSB on Android: Chrome 89+ (Android 12+). Older Android: WebRTC fallback only.
- Web Push: Requires registering a VAPID key pair. Push service works on Chrome, Firefox, and Samsung Internet.
- WebAuthn PRF: Chrome on Android supports PRF extension in Credential Management API.
- Ghost Actuator: Android AccessibilityService API 28+. The PWA discovers the APK via intent or the user installs it separately.
- Rust WASM: Optional. The PWA can run in pure TypeScript without WASM. WASM compilation is an optimization for crypto performance on low-end devices.
