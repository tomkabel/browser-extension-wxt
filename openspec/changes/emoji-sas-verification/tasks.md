## 1. Emoji SAS Core

- [x] 1.1 Define 64-emoji palette in `lib/channel/emojiPalette.ts` with Unicode codepoints and human-readable names
- [x] 1.2 Implement `deriveEmojiSas(sessionKey: Uint8Array): [string, string, string]` using SHA-256 + 6-bit indexing
- [x] 1.3 Add unit tests for SAS derivation: same key → same emoji, different key → different emoji
- [x] 1.4 Wire `deriveEmojiSas()` into `pairingCoordinator.ts` after XX handshake completion
- [x] 1.5 Update `PairingPanel.tsx` to display 3 emoji at 48px alongside QR code after handshake completes

## 2. Match/No Match Confirmation Flow

- [x] 2.1 Add "Match" and "No Match" buttons to `PairingPanel.tsx` (visible only when emoji SAS is displayed)
- [x] 2.2 Implement `confirmSasMatch()` in `pairingCoordinator.ts` — sends confirmation to phone via data channel
- [x] 2.3 Implement `rejectSasMatch()` — aborts pairing, clears session, returns to unpaired state
- [x] 2.4 Add `pairing-confirmed` message type to `types/index.ts` MessageType union
- [x] 2.5 Update background handler to process `pairing-confirmed` and transition to `paired` state

## 3. Accessibility Fallback

- [x] 3.1 Add `detectAccessibilityPrefs()` in `lib/channel/qrCode.ts` — checks `prefers-reduced-motion` and screen reader presence
- [x] 3.2 Add `setSasMode()` to Zustand store with `'emoji' | 'numeric'` type
- [x] 3.3 Add "Use digits instead" button in `PairingPanel.tsx` for manual numeric toggle
- [x] 3.4 In numeric mode, display 6-digit SAS (existing behavior) with "Confirm" button instead of emoji+Match

## 4. Android Companion

- [ ] 4.1 Implement emoji SAS derivation on Android (`EmojiSasDerivation.kt` — same algorithm as extension)
- [ ] 4.2 Update `PairingFragment.kt` to show 3-emoji SAS with "Yes, Match" / "No, Cancel" after handshake
- [ ] 4.3 Handle `pairing-confirmed` message sent from extension after user taps "Match"
- [ ] 4.4 Add accessibility fallback on Android: show numeric SAS for TalkBack users

## 5. Signaling Server Compatibility

- [x] 5.1 Update `signaling-server/server.js` to accept emoji SAS codes in `join-room` (alongside existing numeric support)

## 6. Testing & Polish

- [ ] 6.1 Add E2E test for emoji SAS pairing flow (QR scan → handshake → emoji display → confirm match)
- [x] 6.2 Add unit test for accessibility preference detection
- [x] 6.3 Run `bun run lint && bun run typecheck` and fix all issues
- [ ] 6.4 Manual QA: test numeric fallback with screen reader enabled
