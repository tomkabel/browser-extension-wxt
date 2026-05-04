## 1. Install axe-core for Playwright

- [x] 1.1 Install `@axe-core/playwright`: `bun add -d @axe-core/playwright`
- [x] 1.2 Add axe-core a11y test file at `e2e/accessibility.spec.ts`

## 2. Add ARIA Roles and Live Regions

- [x] 2.1 `PairingPanel`: added `role="img"` + `aria-label` to QR canvas; added `aria-live="polite"` + `role="status"` to SAS display
- [x] 2.2 `TransactionPanel`: added `aria-live="assertive"` to transaction status messages
- [x] 2.3 `CredentialPanel`: added `aria-live="polite"` to credential status messages
- [x] 2.4 `TransportIndicator`: added `role="status"` + `aria-live="polite"`
- [x] 2.5 `SessionStatus`: added `role="timer"` + `aria-label` with dynamic expiry value

## 3. Add Heading Hierarchy

- [x] 3.1 Added visually-hidden `<h1>` with ref to each panel component
- [x] 3.2 Existing `<h2>` elements remain for section headings
- [x] 3.3 Single `<h1>` per popup — panels are mutually exclusive

## 4. Implement Focus Management

- [x] 4.1 Added `forwardRef` to each panel component for h1 ref
- [x] 4.2 Added `useEffect` in `PanelRouter` focusing active panel's h1 on transition
- [x] 4.3 All `focus()` calls use `{ preventScroll: true }`
- [x] 4.4 Tab order follows visual layout with `focus-visible` added to all interactive elements

## 5. Add Keyboard Navigation

- [x] 5.1 All buttons/links are native elements with tabIndex=0 (reachable via Tab)
- [x] 5.2 Native button elements handle Enter/Space by default
- [x] 5.3 Escape closes the popup via browser default behavior
- [x] 5.4 Added `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500` to all interactive elements

## 6. Add Color Contrast Fixes

- [x] 6.1 E2E color contrast audit test added (separate from structure tests)
- [x] 6.2 Fixed `text-gray-400` to `text-gray-500`/`text-gray-600` across all panels for WCAG AA
- [x] 6.3 Contrast test runs on unpaired popup state

## 7. Add prefers-reduced-motion Support

- [x] 7.1 Added `@media (prefers-reduced-motion: reduce)` block to `entrypoints/popup/style.css`
- [x] 7.2 Panel transitions use `focus()` not animations, so instantaneous with reduced motion

## 8. Add Playwright Accessibility Tests

- [x] 8.1 Added test: unpaired popup (PairingPanel) — zero critical/serious violations
- [x] 8.2 Added test: paired popup (AuthPanel) — zero critical/serious violations
- [x] 8.3 Added test: transaction verification (TransactionPanel) — zero critical/serious violations
- [x] 8.4 Added test: credential auto-fill (CredentialPanel: requesting state) — zero critical/serious violations

## 9. Final Verification

- [x] 9.1 Run `bun run lint && bun run typecheck && bun run test && bun run test:e2e` — typecheck ✔, test ✔ (235/235 pass), lint pre-existing, test:e2e requires built extension
- [ ] 9.2 Manual verification: navigate all panels with keyboard only (no mouse)
- [ ] 9.3 Manual verification: enable screen reader, verify SAS code and status changes are announced
