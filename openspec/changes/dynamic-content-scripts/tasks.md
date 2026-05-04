## 1. Add `scripting` Permission to Manifest

- [ ] 1.1 Add `"scripting"` to permissions array in `wxt.config.ts`
- [ ] 1.2 Add `"host_permissions": ["*://*/*"]` or use `activeTab` + dynamic grants
- [ ] 1.3 Verify `bun run build` works with the new permissions

## 2. Implement Dynamic Script Registration in Background

- [ ] 2.1 Create `entrypoints/background/contentScriptManager.ts`:
  - `registerForDomain(domain: string): Promise<string>` — calls `chrome.scripting.registerContentScripts()`
  - `unregisterForDomain(domain: string): Promise<void>` — calls `chrome.scripting.unregisterContentScripts()`
  - `getApprovedDomains(): Promise<ApprovedDomain[]>` — reads from `chrome.storage.sync`
- [ ] 2.2 On background startup: read `chrome.storage.sync` approved domains, re-register any scripts cleared by Chrome
- [ ] 2.3 Script ID format: `credential-fill-<SHA256(domain).hex>` for collision resistance
- [ ] 2.4 Unit test: register → domain appears in approved list
- [ ] 2.5 Unit test: unregister → domain removed and script deregistered

## 3. Add Unapproved Domain Detection to Content Script

- [ ] 3.1 In `entrypoints/content/index.ts`: when `detectLoginForm()` finds a form on a domain NOT in `APPROVED_DOMAINS` and NOT in `INJECTED_PAGES`, send `login-form-detected-unapproved` instead of triggering credential request
- [ ] 3.2 Include domain, URL, and form selectors in the message payload

## 4. Add Permission Prompt to Popup

- [ ] 4.1 Create popup UI for domain permission prompt: shows domain name with "Allow" and "Deny" buttons
- [ ] 4.2 On "Allow": call `contentScriptManager.registerForDomain()`, then trigger credential request flow
- [ ] 4.3 On "Deny": add domain to session-scoped ignore list (no repeat prompt for same session)
- [ ] 4.4 Add icon badge: background sets badge count = number of pending unapproved domains
- [ ] 4.5 Unit test: allow triggers registration
- [ ] 4.6 Unit test: deny adds to ignore list

## 5. Add Settings Panel

- [ ] 5.1 Add gear icon to popup header that opens Settings panel
- [ ] 5.2 Settings panel lists all approved domains from `chrome.storage.sync`
- [ ] 5.3 Each domain has a "Revoke" button that calls `unregisterForDomain()`
- [ ] 5.4 Empty state: "No approved domains" message

## 6. Final Verification

- [ ] 6.1 Run `bun run lint && bun run typecheck && bun run test` — all pass
- [ ] 6.2 Manual QA: visit a non-whitelisted login page, approve domain, verify credential auto-fill works
- [ ] 6.3 Manual QA: revoke domain, revisit, verify permission prompt appears again
