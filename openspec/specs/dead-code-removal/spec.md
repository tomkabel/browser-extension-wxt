# dead-code-removal Specification

## Purpose

Remove orphaned files, duplicate implementations, and unused components identified during the architectural security remediation. The signaling server had a duplicate ESM implementation (`server.mjs` alongside `server.js`), popup panels were renamed to reflect the new Pairing/Auth/Transaction architecture, and several experimental entrypoints were left behind.

## Requirements

### Requirement: Remove duplicate signaling server file

The duplicate `server.mjs` signaling server implementation SHALL be deleted from the repository. Only `server.js` (CommonJS) SHALL remain.

#### Scenario: Duplicate file deleted

- **WHEN** the dead-code removal is applied
- **THEN** `signaling-server/server.mjs` SHALL NOT exist (only `signaling-server/server.js` SHALL remain)
- **AND** `signaling-server/package.json` scripts SHALL only reference `server.js`

### Requirement: Remove orphaned panels from old architecture

The old DomainPanel, ContentPanel, and ApiPanel components that were replaced by the PairingPanel/AuthPanel/TransactionPanel architecture SHALL be deleted. These files may still exist from before the panel refactor.

#### Scenario: Orphaned panels deleted

- **WHEN** the dead-code removal is applied
- **THEN** `entrypoints/popup/panels/ContentPanel.tsx` SHALL NOT exist (if present)
- **AND** `entrypoints/popup/panels/DomainPanel.tsx` SHALL NOT exist (if present)
- **AND** `entrypoints/popup/panels/ApiPanel.tsx` SHALL NOT exist (if present)

### Requirement: Remove webauthn-intercept content script

The WebAuthn interception content script that only logs without acting SHALL be deleted if it exists.

#### Scenario: Intercept script deleted

- **WHEN** the dead-code removal is applied
- **THEN** `entrypoints/webauthn-intercept.content/index.ts` SHALL NOT exist

### Requirement: Remove orphaned pairing coordinator

The `pairingCoordinator.ts` file SHALL be removed if its functions have been absorbed into `pairingService.ts` and it is no longer imported.

#### Scenario: Coordinator deleted

- **WHEN** the dead-code removal is applied
- **AND** `entrypoints/background/pairingCoordinator.ts` exists and is confirmed dead code
- **THEN** `entrypoints/background/pairingCoordinator.ts` SHALL NOT exist
- **AND** `bun run build` SHALL complete without errors

### Requirement: Build succeeds after removals

The build process SHALL succeed after all dead-code files are removed.

#### Scenario: Build succeeds

- **WHEN** `bun run build` is executed after file removals
- **THEN** the build SHALL complete without errors
- **AND** `bun run test` SHALL pass
