# Eliminate Dead Code and Duplicated Infrastructure

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

Multiple source files and infrastructure artifacts are unreferenced, duplicated, or non-functional:

1. **`signaling-server/server.mjs`** — Parallel implementation with a different event protocol (`join`/`offer`/`answer` vs `join-room`/`sdp-offer`/`sdp-answer`). The extension uses only the `server.js` protocol. `server.mjs` is unreferenced in `package.json` scripts (`"start": "node server.js"`).

2. **`entrypoints/popup/panels/ContentPanel.tsx`**, **`DomainPanel.tsx`**, **`ApiPanel.tsx`** — Defined with full lifecycle logic (messages, state) but never imported by `App.tsx:5-13`. The `PanelRouter` only renders `PairingPanel`, `AuthPanel`, and `TransactionPanel`. These panels constitute dead code that confuses developers and increases bundle size.

3. **`entrypoints/webauthn-intercept.content/index.ts`** — Content script in MAIN world that patches `navigator.credentials.create` and `.get` but only logs, never acts. No functionality depends on its presence. Its `matches: ['<all_urls>']` runs on every page.

4. **`entrypoints/background/pairingCoordinator.ts`** — Defines `startPairingFlow`, `disconnectSession`, `handleDataChannelOpen`, `handleDataChannelMessage`, and `getSession`, but these are never called. Pairing initiation flows through `pairingService.ts` → `offscreenWebrtc/main.ts` directly.

### Solution

1. Delete `signaling-server/server.mjs`.
2. Delete `entrypoints/popup/panels/ContentPanel.tsx`, `DomainPanel.tsx`, `ApiPanel.tsx` and their associated test files.
3. Delete `entrypoints/webauthn-intercept.content/index.ts`.
4. Delete `entrypoints/background/pairingCoordinator.ts`.
5. Remove references to deleted files from ESLint/Build configs where applicable.
6. Verify build succeeds and extension loads without errors.

### Acceptance Criteria

- `bun run build` completes successfully after file removals.
- `bun run test` passes (tests for deleted files are removed).
- Popup renders and functions identically to before.
- Bundle size decreases measurably.
