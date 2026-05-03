## 1. WebAuthn PRF Credential Creation

- [x] 1.1 Add `createPrfCredential(salt: Uint8Array)` to `lib/crypto/fallbackAuth.ts` — calls `navigator.credentials.create()` with `extensions: { prf: { eval: { first: salt } } }`
- [x] 1.2 Add `assertPrfCredential(salt: Uint8Array)` — calls `navigator.credentials.get()` with `mediation: 'silent'`, `allowCredentials` omitted (discoverable credential), and PRF extension
- [x] 1.3 Feature-detect WebAuthn PRF support (`PublicKeyCredential.isConditionalMediationAvailable?.()` etc.)
- [x] 1.4 Generate PRF salt as `SHA-256(phoneStaticPublicKey || "smartid2-reauth-v1")` during pairing
- [x] 1.5 Optionally cache credential ID in `chrome.storage.session` as optimization for same-session SW wake events (NOT required for cross-restart recovery — authenticator discovers credential via empty `allowCredentials`)

## 2. Silent Re-authentication Flow

- [x] 2.1 Add `performSilentReauth()` to `sessionManager.ts` — checks for PRF credential, asserts it, derives key
- [x] 2.2 Implement `restoreSessionViaPrf()` — creates IK handshake using PRF-derived key, completes over WebRTC
- [x] 2.3 Call `performSilentReauth()` during service worker startup in `entrypoints/background/index.ts`
- [x] 2.4 Add fallback: if PRF assertion fails or is unavailable, fall back to existing `restorePersistedSession()` (PIN mode)
- [x] 2.5 Wire `performSilentReauth()` into message handler for `check-session` to trigger on popup open

## 3. IK Handshake with PRF-Derived Key

- [x] 3.1 Ensure `createIKHandshake()` in `lib/channel/noise.ts` works with arbitrary `localStaticKey` (not just the original pairing key)
- [x] 3.2 Pass PRF-derived key as `localStaticKey` to `createIKHandshake()` in `pairingCoordinator.ts`

## 4. Zero Persistent Cryptographic State

- [x] 4.1 Audit `chrome.storage.local` usage across all files — identify all cryptographic key storage
- [x] 4.2 Remove ECDSA private key persistence from `fallbackAuth.ts`; keep only PIN-encrypted wrapper in `chrome.storage.local`
- [x] 4.3 Add runtime assertion in `sessionManager.ts`: on `clearSession()`, verify `chrome.storage.local` has no cryptographic material
- [x] 4.4 Ensure `chrome.storage.session` is the ONLY store for active noise keypairs and session tokens
- [x] 4.5 Add development-mode log on session activation: "Crypto audit: keys in session storage only"

## 5. Session Persistence Adaptation

- [x] 5.1 Update `restorePersistedSession()` to only run in PIN-fallback mode (no PRF available)
- [x] 5.2 Remove `SESSION_PERSISTED_KEY` writes from `activateSession()` when PRF is available
- [x] 5.3 Update `session-persistence` spec tests to cover both PRF mode and PIN fallback mode

## 6. Auth Page Updates

- [x] 6.1 Update `entrypoints/auth/main.ts` to trigger `createPrfCredential()` after pairing handshake completes
- [x] 6.2 Add `prf-credential-created` message type to relay credential ID from auth page to background
- [x] 6.3 Handle PRF credential creation errors gracefully: show "Fingerprint setup skipped" and fall back to PIN

## 7. Android Companion

- [ ] 7.1 Android: Store PRF credential ID received from extension during pairing
- [ ] 7.2 Android: Accept IK reconnection with PRF-derived key (same salt computation)

_Note: Android tasks are implemented in the companion app repository, not in this extension codebase._

## 7a. Spec Alignment (see analysis in ARCHITECTURE.md review)

- [x] 7a.1 Update `webauthn-prf-silent-reauth/design.md` Decision 2 — clarify discoverable credentials (no software-side caching required), explain that "cached key" in ARCHITECTURE.md refers to authenticator hardware retention
- [x] 7a.2 Update `specs/webauthn-prf-derivation/spec.md` — credential creation creates discoverable credential; assertion uses empty `allowCredentials`
- [x] 7a.3 Update `specs/webauthn-auth-page/spec.md` — credential ID is optional optimization, not required
- [x] 7a.4 Update `specs/silent-reauth-flow/spec.md` — PRF credential existence detected via authenticator discovery, not `chrome.storage.session`
- [x] 7a.5 Update root `openspec/specs/session-persistence/spec.md` — PRF credential detection via authenticator, not session storage

## 8. Testing & Polish

- [x] 8.1 Unit test: PRF credential create/assert flow with mocked `navigator.credentials`
- [x] 8.2 Unit test: silent re-auth triggers IK handshake instead of restoring from `storage.local`
- [x] 8.3 Unit test: PIN fallback when PRF is not supported or fails
- [x] 8.4 Unit test: no crypto keys in `chrome.storage.local` after session activation
- [ ] 8.5 Manual QA: pair → restart browser → verify silent re-auth (session active without interaction)
- [ ] 8.6 Manual QA: pair → restart browser → verify PIN fallback works when platform authenticator unavailable
- [x] 8.7 Run `bun run lint && bun run typecheck` and fix all issues

_Note: Tasks 8.5 and 8.6 are manual QA steps that require a real browser with platform authenticator._
