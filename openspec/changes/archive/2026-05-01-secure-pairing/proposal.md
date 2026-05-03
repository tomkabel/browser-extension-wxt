## Why

The extension needs a one-time authenticated pairing with the Android phone before any commands can be sent. This pairing establishes mutual cryptographic trust via a QR-scanned 6-digit SAS code and a Noise XX handshake over a WebRTC data channel. Without this, all subsequent phases (MFA, commands) have no secure transport.

## What Changes

- **QR pairing flow**: Extension displays 6-digit SAS code as QR + text; phone scans QR and user confirms the code visually
- **Noise XX handshake**: First-pairing handshake with identity hiding (3 messages, 1.5 round-trips)
- **Noise IK handshake**: Reconnection fast path when static keys are already cached (1 round-trip)
- **WebRTC data channel**: `RTCPeerConnection` in offscreen document with DTLS 1.2 encryption; Noise runs inside DTLS as defense-in-depth
- **Signaling server**: Minimal Socket.io server (Render.com/Fly.io) for SDP/ICE exchange
- **Cached pairing state**: Phone's static key stored in `chrome.storage.session` and Android `EncryptedSharedPreferences`

## Capabilities

### New Capabilities

- `qr-sas-pairing`: Extension generates and displays 6-digit SAS QR code; phone scans, confirms code, completes pairing
- `noise-xx-handshake`: First-pairing Noise XX pattern with mutual identity hiding and authentication
- `noise-ik-reconnect`: Reconnection Noise IK pattern with cached static keys (fast path)
- `webrtc-data-channel`: Reliable ordered data channel over RTCPeerConnection with DTLS encryption
- `signaling-server`: Minimal Socket.io server for SDP/ICE exchange between extension and phone
- `pairing-state-storage`: Cached pairing device keys on both sides

### Modified Capabilities

None — these are entirely new capabilities.

## Impact

- `lib/channel/noise.ts` — Noise XX + IK state machine wrapper over @noble/* primitives
- `lib/channel/noiseTypes.ts` — Type definitions for NoiseSession, CipherState, HandshakeState
- `lib/channel/qrCode.ts` — QR generation utility (6-digit SAS code on canvas)
- `entrypoints/popup/panels/PairingPanel.tsx` — QR display, pairing status UI
- `entrypoints/offscreen.html` — WebRTC RTCPeerConnection in offscreen document
- `signaling-server/` — Socket.io server for SDP relay
- Android: `WebRTCManager.kt`, `SignalingClient.kt`, `NoiseXXResponder.kt`, `NoiseIKResponder.kt`
- Android: `EncryptedSharedPreferences` for paired device storage
