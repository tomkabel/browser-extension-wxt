## Why

The popup is the user's primary interface to the SmartID2 system. It must guide the user through pairing, authentication, and transaction verification in a clear, secure manner. Without these panels, the system has no user-facing UI.

## What Changes

- **PairingPanel.tsx**: QR display with large SAS code text, pairing status state machine, "Paired!" confirmation
- **AuthPanel.tsx**: "Authenticate" button that opens the extension's WebAuthn auth page via `chrome.tabs.create()`, session status display
- **TransactionPanel.tsx**: Shows transaction data (amount, recipient) from DOM scraping, "Verify on Phone" button, confirmation/rejection status from phone
- **SessionStatus.tsx**: Session timer countdown (5 min TTL), idle timeout warning, re-authenticate prompt
- **Popup UI flow**: State machine handling unpaired → paired-not-authenticated → paired-authenticated states

## Capabilities

### New Capabilities

- `pairing-panel`: QR + SAS code display, pairing progress, device naming
- `auth-panel`: Authentication springboard (opens chrome.tabs.create), session status
- `transaction-panel`: Transaction data display, verification trigger, confirmation/rejection
- `session-status`: TTL countdown, idle timeout, re-authenticate prompt

### Modified Capabilities

- `popup-app`: Update App.tsx to route between panels based on pairing/auth state

## Impact

- `entrypoints/popup/panels/PairingPanel.tsx` — New file
- `entrypoints/popup/panels/AuthPanel.tsx` — New file
- `entrypoints/popup/panels/TransactionPanel.tsx` — New file
- `entrypoints/popup/panels/SessionStatus.tsx` — New file
- `entrypoints/popup/App.tsx` — Updated to integrate new panels
- `lib/store.ts` — Zustand store extended with channel/auth state slices
