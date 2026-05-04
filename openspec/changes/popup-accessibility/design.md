## Context

The popup has 4 panels (Pairing, Auth, Transaction, Credential) plus SessionStatus, TransportIndicator, and AttestationStatus components. The only accessibility feature is a mode toggle on the SAS display (emoji vs numeric). No ARIA roles, heading hierarchy, focus management, color contrast verification, or keyboard navigation analysis has been performed.

## Goals / Non-Goals

**Goals:**
- WCAG 2.1 AA compliance for the popup UI
- ARIA roles and labels on all interactive and status elements
- Proper heading hierarchy (`<h1>` → `<h2>` → `<h3>`)
- Focus management on panel transitions and modal interactions
- Color contrast audit and remediation
- Keyboard operability (Tab, Enter/Space, Escape)
- `prefers-reduced-motion` support
- Playwright + axe-core automated tests

**Non-Goals:**
- Screen reader compatibility for the QR canvas visual content (the numeric SAS code is the accessible alternative)
- Mobile browser accessibility (popup is desktop-only)
- Extension options page accessibility (no options page exists)

## Decisions

### Decision 1: Panel heading structure

Each panel gets:
```tsx
<h1 className="sr-only">{panelTitle}</h1>
```
The `<h1>` is visually hidden but available to screen readers. Sections within panels use `<h2>`. The `sr-only` class from Tailwind ensures visual designers maintain full control of the visual layout while screen readers get structure.

Panel transitions use `useEffect` to focus the `<h1>`:
```tsx
useEffect(() => {
  headingRef.current?.focus();
}, [panelState]);
```

### Decision 2: Live regions for status updates

Status elements that change dynamically get `aria-live`:
- SAS display: `aria-live="polite"` — updates when the SAS code is derived
- Transaction status: `aria-live="assertive"` — transaction confirm/reject is time-sensitive
- Credential status: `aria-live="polite"` — "Credentials filled" announcement
- Session countdown: `role="timer"` with `aria-label="Session expires in X seconds"`
- Transport indicator: `role="status"` — "Connected via USB" etc.

### Decision 3: axe-core in Playwright

```typescript
import { injectAxe, checkA11y } from 'axe-playwright';

test('pairing panel has no accessibility violations', async ({ page }) => {
  await page.goto(extensionPopupUrl);
  await injectAxe(page);
  await page.click('[data-testid="start-pairing"]');
  await checkA11y(page, {
    includedImpacts: ['critical', 'serious'],
  });
});
```
Run as part of the E2E test suite. Critical and serious violations fail the test.

### Decision 4: prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
Applied globally in `entrypoints/popup/style.css`. The `!important` is necessary to override component-level animations.

## Risks / Trade-offs

- [Risk] `aria-live="assertive"` may be too aggressive for transaction status — It's intentional: a transaction confirm/reject is a time-critical notification that the user should hear immediately.
- [Risk] axe-core may generate false positives for the custom QR canvas — Mitigation: add `role="img"` with `aria-label="Pairing QR code. Use the numeric code displayed below as an alternative."`.
- [Risk] Focus management on panel transition may scroll the popup — Mitigation: use `{ preventScroll: true }` on the `focus()` call.
