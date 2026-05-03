## Context

Phase 2 of SmartID2. A MFA gate that requires platform authenticator verification before any transaction commands can be sent. The extension serves its own auth page at `chrome-extension://<id>/pages/auth.html` which acts as the WebAuthn RP context. This proposal is contingent on Spike 0.1 passing.

## Goals / Non-Goals

**Goals:**
- Credential registration: user creates a resident discoverable credential on the platform authenticator
- MFA assertion: `navigator.credentials.get()` with `userVerification: 'required'` before session activation
- Session state in `chrome.storage.session` with 5-minute TTL via `chrome.alarms`
- Popup springboard: opens auth tab, user authenticates, tab self-closes, session active

**Non-Goals:**
- Pairing (separate proposal: secure-pairing)
- Command protocol (separate proposal: transaction-protocol)
- Platform authenticator UI — provided natively by Chrome/OS

## Decisions

### 1. Direct Invocation Over Content Script Interception

Test direct `navigator.credentials.get` from the auth page's own `<script>` tag FIRST. Simpler, avoids MV3 content script isolation issues. Content script interception is fallback only.

### 2. Auth Page Approach

- Auth page is a full browser tab (NOT popup — popups close on focus loss)
- Opened via `chrome.tabs.create({ url: chrome.runtime.getURL('pages/auth.html'), active: true })` from the popup Springboard
- After assertion, page sends result to BG via `chrome.runtime.sendMessage` and calls `window.close()`
