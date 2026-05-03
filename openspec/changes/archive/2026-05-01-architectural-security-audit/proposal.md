---
title: 'Architectural & Security Audit: Remediation Proposal'
author: 'Senior Systems Architect / Lead Security Engineer'
status: draft
created: '2026-05-01'
updated: '2026-05-01'
version: 1.0.0-rc1
---

## Business Rationale

The SmartID2 browser extension implements a high-assurance transaction verification pipeline spanning WebAuthn MFA, Noise Protocol-secured WebRTC pairing, DOM content extraction, and REST API relay. A comprehensive audit reveals critical architectural deficits that compromise both operational resilience and security guarantees:

- **Data integrity failure**: The Noise XX handshake in `pairingCoordinator.ts` discards the remote static public key, substituting a zero-filled key. Encrypted sessions provide no actual authentication.
- **Transaction verification is simulated**: The `verify-transaction` handler unconditionally returns `"confirmed"` without any phone-side verification, bypassing the core security promise.
- **Command channel is non-functional**: `commandClient.ts` registers pending commands but `handleIncomingResponse` is never wired into the message pipeline; every command silently times out.
- **Dead code and duplicated infrastructure**: Two signaling server implementations (`server.js`/`server.mjs`), unused popup panels (`ContentPanel`, `ApiPanel`, `DomainPanel`), and an unreferenced WebAuthn interception script increase attack surface and maintenance burden.
- **Secrets committed to repository**: `smartid2-key.pem` (private key), `mydatabase.db` (runtime data), and `a11y-bridge.apk` are present in version control.
- **Operational blind spots**: No error boundaries, no session recovery on service-worker restart, no API endpoint configuration UI, and E2E tests that never interact with extension internals.

## Objectives

1. Remediate the broken Noise handshake to restore cryptographic authentication guarantees.
2. Wire the command client response pipeline so transaction verification actually communicates with the paired phone.
3. Remove dead code, duplicated infrastructure, and committed secrets.
4. Add error boundaries, session persistence, and rate limiting on critical paths.
5. Align E2E tests with actual extension behavior.

## Summary of Structural Changes

- Replace the hand-crafted XX handshake in `pairingCoordinator.ts` with the library's `completeHandshake()` API, extracting the remote static key correctly.
- Wire `commandClient.handleIncomingResponse()` into the WebRTC data-channel message handler.
- Remove `server.mjs`, `smartid2-key.pem`, `mydatabase.db`, `a11y-bridge.apk` from the repository.
- Delete unused panels and the webauthn-intercept content script.
- Add `ErrorBoundary` component to the popup React tree.
- Add session persistence layer using `storage.local` with cross-session recovery.
- Add `frame-ancestors` directive to CSP.
- Introduce environment variable validation at build time for signaling and API URLs.
- Rewrite E2E tests to use `chromium.launchPersistentContext` with extension load.
