## ADDED Requirements

### Requirement: Remove duplicate signaling server

The duplicate `server.mjs` signaling server implementation SHALL be deleted from the repository.

#### Scenario: server.mjs deleted

- **WHEN** the dead-code removal is applied
- **THEN** `signaling-server/server.mjs` SHALL NOT exist
- **AND** `signaling-server/package.json` scripts SHALL only reference `server.js`

### Requirement: Remove unused popup panels

Three popup panel components that are never imported by `App.tsx` SHALL be deleted.

#### Scenario: Unused panels deleted

- **WHEN** the dead-code removal is applied
- **THEN** `entrypoints/popup/panels/ContentPanel.tsx` SHALL NOT exist
- **AND** `entrypoints/popup/panels/DomainPanel.tsx` SHALL NOT exist
- **AND** `entrypoints/popup/panels/ApiPanel.tsx` SHALL NOT exist

### Requirement: Remove webauthn-intercept content script

The WebAuthn interception content script that only logs without acting SHALL be deleted.

#### Scenario: Intercept script deleted

- **WHEN** the dead-code removal is applied
- **THEN** `entrypoints/webauthn-intercept.content/index.ts` SHALL NOT exist

### Requirement: Remove orphaned pairing coordinator

The `pairingCoordinator.ts` file whose functions are all dead code SHALL be deleted.

#### Scenario: Coordinator deleted

- **WHEN** the dead-code removal is applied
- **THEN** `entrypoints/background/pairingCoordinator.ts` SHALL NOT exist

### Requirement: Build succeeds after removals

The build process SHALL succeed after all dead-code files are removed.

#### Scenario: Build succeeds

- **WHEN** `bun run build` is executed after file removals
- **THEN** the build SHALL complete without errors
- **AND** `bun run test` SHALL pass
