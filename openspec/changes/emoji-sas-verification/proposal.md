## Why

The current pairing flow uses a 6-digit numeric SAS code that the user must visually compare between screens. ARCHITECTURE.md Phase 1 mandates a "3-Emoji Short Authentication String (SAS)" (e.g., 🚀 🎸 🥑) because emoji are faster to visually verify and completely neutralize Man-in-the-Middle attacks with zero numerical typing. The user simply taps "Match" on the phone.

## What Changes

- **Replace numeric SAS with 3-emoji SAS** in QR code, pairing URL, and verification UI
- **Add "Match/No Match" confirmation flow** on both extension popup and Android companion app
- **Update pairing URL scheme** to encode emoji SAS as URL-safe identifiers
- **Keep numeric SAS as fallback** for accessibility (screen readers), configurable
- Update `PairingPanel.tsx` to display emoji characters alongside QR code for visual verification
- Update `qrCode.ts` to generate both numeric and emoji SAS, with emoji as the default

## Capabilities

### New Capabilities

- `emoji-sas-display`: Both devices derive a 3-emoji SAS from the Noise handshake session key and display it; user confirms match visually
- `emoji-sas-fallback`: Accessible fallback to numeric SAS when screen reader or reduced-motion preferences are detected

### Modified Capabilities

- `qr-sas-pairing`: SAS generation changes from 6-digit numeric to 3-emoji; pairing URL scheme updated; confirmation flow replaces implicit pairing completion

## Impact

- `lib/channel/qrCode.ts` — New emoji SAS generation, emoji-to-URL-safe encoding, paired with existing numeric generator
- `lib/channel/noise.ts` — SAS derivation from Noise session key (SHA-256 of shared secret → emoji index selection)
- `entrypoints/popup/panels/PairingPanel.tsx` — Emoji display, Match/No Match buttons, accessibility toggle
- `entrypoints/background/pairingCoordinator.ts` — Wait for SAS confirmation before completing pairing
- `entrypoints/background/pairingService.ts` — Add SAS confirmation step to pairing flow
- Android: `EmojiSasDisplay.kt` — Emoji rendering + Match/No Match UI
- Android: `PairingViewModel.kt` — SAS confirmation callback

## Boundary with Archived Changes

This change **refines and replaces** the SAS verification layer from archived `secure-pairing`. It does NOT re-implement the foundational pairing infrastructure. Specifically:

- **Retained from `secure-pairing` (do not modify)**: QR code generation/format, Noise XX handshake, WebRTC data channel establishment, `PairingState` Zustand slice, `pairingCoordinator.ts` state machine
- **Modified by this change**: SAS derivation (`qrCode.ts` — adds emoji generation alongside numeric), SAS display (`PairingPanel.tsx` — adds emoji display + Match/No Match buttons), pairing completion gate (`pairingCoordinator.ts` — adds SAS confirmation step)
- **Added by this change**: Emoji-to-URL-safe encoding, accessibility fallback to numeric SAS, Android `EmojiSasDisplay.kt`
- **Deprecated by this change**: 6-digit numeric SAS as the default (kept as accessibility fallback only)

## V6 Alignment

PHASE 1 — Emoji SAS is the Phase 1 pairing verification mechanism. In V6 (Phase 2), pairing is established via AOA ECDH handshake + WebAuthn passkey creation per SMARTID_VAULT_v6.md §2 (Phase 0). The emoji SAS is replaced by the cryptographic trust anchors established during the USB AOA accessory mode negotiation and WebAuthn credential provisioning. The emoji SAS code and its associated QR flow will be **deprecated in Phase 2** per `vault6-migration-strategy` §2 Component Retention & Deprecation. The `context-aware-approval` phone unlock detection logic from this change is retained as the V6 authorization gate.
