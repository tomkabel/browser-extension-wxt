## Context

Phase 5 of SmartID2. The extension popup is the user's primary interface. It must guide the user through three states: unpaired (PairingPanel), paired but not authenticated (AuthPanel), and authenticated with transaction verification (TransactionPanel).

## Goals / Non-Goals

**Goals:**
- PairingPanel: QR display with large SAS code text, pairing progress animation, error states
- AuthPanel: "Authenticate" button that opens auth tab via chrome.tabs.create(), session timer, re-authenticate prompt
- TransactionPanel: Transaction amount + recipient display, "Verify on Phone" button, confirmation/rejection status
- SessionStatus: 5-minute countdown timer, idle timeout warning at 30s

**Non-Goals:**
- WebAuthn logic (separate proposal: webauthn-mfa-gate)
- Transaction detection (separate proposal: transaction-protocol)
- Noise handshake logic (separate proposal: secure-pairing)

## Decisions

### 1. Popup State Machine

```
unpaired → pairing → paired (cached key exists)
paired → auth-panel (no active session) → authenticated (session in chrome.storage.session)
authenticated → transaction-panel (show data, verify button)
session expires → auth-panel (re-authenticate)
```

### 2. Zustand Backed by chrome.storage.session

Popup reads session state via BG (runtime.sendMessage), not directly from chrome.storage.session. Zustand store mirrors session state for reactive UI updates.
