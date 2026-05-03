# session-persistence Specification

## Purpose

Define how the MFA session survives Chrome MV3 service worker termination and restart, with dual storage (session + local) and WebAuthn PRF-based silent re-authentication as the primary restore mechanism.
## Requirements
### Requirement: Session survives service worker restart

The MFA session SHALL survive Chrome MV3 service worker termination and restart within the session TTL. On restart, the background SHALL attempt silent re-authentication via WebAuthn PRF before restoring from persistence.

#### Scenario: Session restored via PRF re-auth after SW restart

- **WHEN** the service worker restarts (triggered by popup open, tab change, or alarm)
- **AND** a WebAuthn PRF credential exists
- **THEN** the background SHALL first attempt silent PRF assertion
- **AND** if PRF assertion succeeds, SHALL complete IK handshake
- **AND** SHALL NOT read from `chrome.storage.local` for session restoration

#### Scenario: Fallback to local persistence when PRF unavailable

- **WHEN** the service worker restarts
- **AND** no PRF credential exists (PIN fallback mode)
- **AND** the session TTL (5 minutes) has NOT expired
- **THEN** the background SHALL restore the session from `storage.local`
- **AND** `getSession()` SHALL return the session as if uninterrupted

#### Scenario: Expired session not restored

- **WHEN** the service worker restarts
- **AND** the persisted session TTL has expired
- **THEN** `getSession()` SHALL return `null`
- **AND** `storage.local` SHALL be cleared of the persisted session

### Requirement: Dual storage with LRU cleanup

The session SHALL be mirrored to both `storage.session` (primary) and `storage.local` (backup) only when WebAuthn PRF is NOT available (PIN fallback mode).

#### Scenario: Session written to both stores (PIN mode)

- **WHEN** `activateSession()` is called and PRF is not available
- **THEN** the session SHALL be written to both `storage.session` and `storage.local`
- **AND** the local copy SHALL include a `persistedAt` timestamp

#### Scenario: Session stored only in session storage (PRF mode)

- **WHEN** `activateSession()` is called and PRF IS available
- **THEN** the session SHALL be written ONLY to `storage.session`
- **AND** `storage.local` SHALL NOT receive any session data
- **AND** the session SHALL NOT include a `persistedAt` timestamp

#### Scenario: Clear removes from both stores

- **WHEN** `clearSession()` is called
- **THEN** the session SHALL be removed from both `storage.session` and `storage.local`

