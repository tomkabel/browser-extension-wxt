## ADDED Requirements

### Requirement: Session survives service worker restart

The MFA session SHALL survive Chrome MV3 service worker termination and restart within the session TTL.

#### Scenario: Session restored after SW restart

- **WHEN** an MFA session is activated via `activateSession()`
- **AND** the service worker terminates (MV3 lifecycle)
- **AND** the service worker restarts (triggered by popup open, tab change, or alarm)
- **AND** the session TTL (5 minutes) has NOT expired
- **THEN** the background SHALL restore the session from `storage.local`
- **AND** `getSession()` SHALL return the session as if uninterrupted

#### Scenario: Expired session not restored

- **WHEN** the service worker restarts
- **AND** the persisted session TTL has expired
- **THEN** `getSession()` SHALL return `null`
- **AND** `storage.local` SHALL be cleared of the persisted session

### Requirement: Dual storage with LRU cleanup

The session SHALL be mirrored to both `storage.session` (primary) and `storage.local` (backup).

#### Scenario: Session written to both stores

- **WHEN** `activateSession()` is called
- **THEN** the session SHALL be written to both `storage.session` and `storage.local`
- **AND** the local copy SHALL include a `persistedAt` timestamp

#### Scenario: Clear removes from both stores

- **WHEN** `clearSession()` is called
- **THEN** the session SHALL be removed from both `storage.session` and `storage.local`
