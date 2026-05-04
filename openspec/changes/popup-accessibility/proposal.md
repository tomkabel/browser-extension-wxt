## Why

The popup has an accessibility mode toggle for SAS display but no formal accessibility review. Users who rely on screen readers, keyboard navigation, or high-contrast mode cannot effectively use the extension. The popup is the primary user interface and must meet WCAG 2.1 AA standards to avoid excluding users and to comply with accessibility regulations.

## What Changes

Add ARIA roles and attributes to all interactive elements (QR canvas, SAS display, transport indicator, all buttons). Add heading hierarchy (`<h1>` for panel titles, `<h2>` for sections). Implement focus management on panel transitions. Audit and fix color contrast to meet WCAG AA (4.5:1 normal text, 3:1 large text). Add keyboard navigation (Tab order, Escape close, Enter/Space activation). Respect `prefers-reduced-motion`. Add Playwright accessibility tests using `@axe-core/playwright`.

### SAS Enhancement: 4 Emoji + QR Public Key Binding

The emoji SAS is increased from 3 to 4 emoji (improving entropy from 18 bits to 24 bits, making attacker guess probability 1/16.7M instead of 1/262k). The SAS derivation is bound to the QR code public key:

```
sasSeed = SHA-256(chainingKey || qrCodePublicKey)
```

This prevents a class of MITM attacks where an attacker swaps the QR code at the printing/display stage. Previously, the SAS matched the attacker's phone, not the vault — because the SAS was derived from the handshake chaining key alone, which the attacker's phone also establishes. By hashing the QR public key into the SAS seed, the SAS is bound to the specific QR the user scanned. If the QR is swapped, the SAS changes.

The numeric fallback increases to 6 digits (1M combinations) for screen reader users. The popup and Android app both support a toggle between emoji and numeric SAS, auto-detecting accessibility prefs.

## Capabilities

### New Capabilities
- `aria-roles-labels`: ARIA roles, labels, and live regions for all interactive and status elements
- `heading-hierarchy`: Proper `<h1>`/`<h2>` structure across all panels
- `focus-management`: Focus moves to panel heading on transition; focus trapped within popup
- `color-contrast`: All text meets WCAG AA minimum contrast ratios
- `keyboard-navigation`: Complete keyboard operability including Escape, Tab, Enter/Space
- `reduced-motion`: CSS transitions disabled when `prefers-reduced-motion: reduce`
- `a11y-tests`: Playwright + axe-core automated accessibility tests in CI

### Existing Capabilities Modified
- `pairing-panel`: Add aria-live region for SAS status; fix QR canvas ARIA
- `auth-panel`: Add accessible heading and status announcements
- `transaction-panel`: Add aria-live for transaction data updates
- `credential-panel`: Add aria-live for credential status changes
- `transport-indicator`: Add role="status" aria-live="polite"
- `session-status`: Add role="timer" aria-label for countdown
