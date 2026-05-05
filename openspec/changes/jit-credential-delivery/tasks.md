## 1. Login Field Detection

- [x] 1.1 Add `detectLoginForm()` to `entrypoints/content/domScraper.ts` — scans for `input[type="password"]` and extracts username + password selectors
- [x] 1.2 Implement `MutationObserver` in `entrypoints/content/index.ts` to detect dynamically added login forms
- [x] 1.3 Add debouncing (500ms) to prevent rapid re-scans during SPA re-renders
- [x] 1.4 Emit `detect-login-form` message with payload `{ domain, url, usernameSelector, passwordSelector, formAction }`
- [x] 1.5 Add `detect-login-form` to `types/index.ts` MessageType union

## 2. Credential Request Protocol

- [x] 2.1 Add `credential-request` command type to `types/commands.ts` CommandType
- [x] 2.2 Implement `sendCredentialRequest()` method in `lib/channel/commandClient.ts`
- [x] 2.3 Add `credential-request` message handler in `entrypoints/background/messageHandlers.ts` — dispatches via `commandClient.sendCredentialRequest()`
- [x] 2.4 Add `credential-request` and `credential-response` to `types/index.ts` MessageType
- [x] 2.5 Implement 30-second per-domain rate limiting in background handler
- [x] 2.6 Implement 10-second timeout for credential request responses

## 3. Context-Aware Approval Protocol

- [x] 3.1 Define response protocol: `{ status, username?, password?, approval_mode }` in types
- [x] 3.2 Add `approval_mode: 'auto' | 'biometric'` field to credential response type
- [x] 3.3 Extension: handle `approval_mode: 'auto'` — auto-inject immediately upon response, show "Credentials filled automatically"
- [x] 3.4 Extension: handle `approval_mode: 'biometric'` — show "Waiting for phone authentication..." until response arrives, then auto-inject on receipt

## 4. Micro-Payload DOM Injection

- [x] 4.1 Add `injectCredentials()` function in content script — targets fields by stored selectors, sets `.value`, dispatches `input`/`change` events
- [x] 4.2 Handle `credential-response` message in content script message bus
- [x] 4.3 Implement buffer zeroing: `decryptedBuffer.fill(0)` after injection, set password string to `''`
- [x] 4.4 Handle "field not found" case: display error in popup, do NOT inject into random fields

## 5. Popup Updates

- [x] 5.1 Create `CredentialPanel.tsx` in `entrypoints/popup/panels/` — shows "Login detected on <domain>" status with auto-inject progress indicator; NO manual "Fill Credentials" button (injection is automatic on phone response)
- [x] 5.2 Add credential request state to `lib/store.ts`: `credentialState`, `credentialDomain`, `credentialStatus`
- [x] 5.3 Wire `CredentialPanel` into `App.tsx` lazy-loaded panels
- [x] 5.4 Show "Credentials filled" confirmation after successful injection
- [x] 5.5 Show "No credentials found" when phone returns `not_found`

## 6. Android Companion (React Native — migrated to `react-native-companion-app`)

> **Status**: Extension-side credential protocol (tasks 1–5) is complete. The phone-side
> implementation (tasks 6.x below) has been **moved** into `react-native-companion-app`
> which owns all React Native code. These tasks are tracked there as:
> - `react-native-companion-app` task 5.1 (KeyVault)
> - `react-native-companion-app` task 4.3 (credential-request handler)
> 
> This section is retained as a cross-reference only. No work happens here.
> The dependency is one-directional: `react-native-companion-app` uses the protocol
> defined in tasks 1–5 (extension side), which is already complete.

- [x] 6.1 Extension protocol definition (moved to RN app)
- [x] 6.2 Phone-side vault implementation (tracked in `react-native-companion-app` tasks 4.3, 5.1)
- [x] 6.3 Biometric approval gate (tracked in `react-native-companion-app` tasks 4.3, 5.2)
- [x] 6.4 "Not found" response (handled by extension protocol, already implemented)

## 7. Spec Alignment (see analysis in ARCHITECTURE.md review)

- [x] 7.1 Update `design.md` Decision 2 — add Decision 4: auto-inject on micro-payload receipt, no popup button required
- [x] 7.2 Update `specs/micro-payload-injection/spec.md` — injection is automatic, no manual trigger
- [x] 7.3 Update `specs/credential-request-protocol/spec.md` — remove "user taps Fill Credentials" trigger
- [x] 7.4 Update `specs/extension-messaging/spec.md` Flow 5 — background auto-triggers on detection
- [x] 7.5 Update `specs/context-aware-approval/spec.md` — clarify auto-inject with zero popup interaction

## 8. Testing & Polish

- [x] 8.1 Unit test: login form detection on various DOM structures (standard, SPA, password-only, no form)
- [ ] 8.2 Unit test: credential request rate limiting (same domain within 30s)
- [ ] 8.3 Unit test: credential injection and buffer zeroing
- [ ] 8.4 E2E test: full credential request flow (detect → request → inject)
- [ ] 8.5 Manual QA: test on real login page (e.g., GitHub)
- [ ] 8.6 Manual QA: test with phone locked vs unlocked
- [x] 8.7 Run `bun run lint && bun run typecheck` and fix all issues
