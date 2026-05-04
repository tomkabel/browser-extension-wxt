## 1. Install axe-core for Playwright

- [ ] 1.1 Install `@axe-core/playwright`: `bun add -d @axe-core/playwright`
- [ ] 1.2 Add axe import and `injectAxe`/`checkA11y` helpers to existing E2E test setup

## 2. Add ARIA Roles and Live Regions

- [ ] 2.1 `PairingPanel`: add `role="img"` + `aria-label` to QR canvas; add `aria-live="polite"` + `role="status"` to SAS display
- [ ] 2.2 `TransactionPanel`: add `aria-live="assertive"` to transaction status messages
- [ ] 2.3 `CredentialPanel`: add `aria-live="polite"` to credential status messages
- [ ] 2.4 `TransportIndicator`: add `role="status"` + `aria-live="polite"`
- [ ] 2.5 `SessionStatus`: add `role="timer"` + `aria-label` with dynamic expiry value

## 3. Add Heading Hierarchy

- [ ] 3.1 Add visually-hidden `<h1>` to each panel component with the panel title
- [ ] 3.2 Use `<h2>` for section headings within panels
- [ ] 3.3 Verify only one `<h1>` exists in popup DOM at any time

## 4. Implement Focus Management

- [ ] 4.1 Add ref to each panel's `<h1>` element
- [ ] 4.2 Add `useEffect` in `App.tsx` that focuses the active panel's `<h1>` on panel transition
- [ ] 4.3 Use `{ preventScroll: true }` on all programmatic `focus()` calls
- [ ] 4.4 Verify Tab order follows visual layout in all panels

## 5. Add Keyboard Navigation

- [ ] 5.1 Verify all buttons/links are reachable via Tab
- [ ] 5.2 Verify Enter/Space activates focused elements
- [ ] 5.3 Verify Escape closes the popup
- [ ] 5.4 Add visible focus ring (2px outline, contrast ≥ 3:1) to all interactive elements via Tailwind `focus-visible:` utilities

## 6. Add Color Contrast Fixes

- [ ] 6.1 Audit all text colors against background colors using axe-core
- [ ] 6.2 Fix any that fail WCAG AA: normal text ≥ 4.5:1, large text ≥ 3:1
- [ ] 6.3 Verify contrast in all panel states (light + dark if supported)

## 7. Add prefers-reduced-motion Support

- [ ] 7.1 Add `@media (prefers-reduced-motion: reduce)` block to `entrypoints/popup/style.css` disabling all animations/transitions
- [ ] 7.2 Verify panel transitions are instantaneous with reduced motion

## 8. Add Playwright Accessibility Tests

- [ ] 8.1 Add test: unpaired popup (PairingPanel) — zero critical/serious violations
- [ ] 8.2 Add test: paired popup (AuthPanel) — zero critical/serious violations
- [ ] 8.3 Add test: transaction verification (TransactionPanel) — zero critical/serious violations
- [ ] 8.4 Add test: credential auto-fill (CredentialPanel: detecting, requesting, filled, error) — zero critical/serious violations

## 9. Final Verification

- [ ] 9.1 Run `bun run lint && bun run typecheck && bun run test && bun run test:e2e` — all pass
- [ ] 9.2 Manual verification: navigate all panels with keyboard only (no mouse)
- [ ] 9.3 Manual verification: enable screen reader, verify SAS code and status changes are announced
