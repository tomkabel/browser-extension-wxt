# Threat Intelligence KB Cross-Reference Analysis

**Date:** 2026-05-03  
**Scope:** Normalized intelligence feed → SmartID2 extension architecture  
**Method:** Attack-surface mapping per codebase layer

---

## Phase 1: Project Capability Mapping

| Layer | Technology | Trust Boundary |
|-------|-----------|----------------|
| Pairing | QR code → WebRTC offer/answer → DTLS | Public (QR is visible) |
| Auth Channel | Noise Protocol XX/IK → ChaChaPoly | E2EE after handshake |
| Verification | Emoji SAS (SHA-256 of chaining key) | User-verifiable |
| Credential Storage | `browser.storage.session` (Noise keypairs) | OS/browser protected |
| Transaction Detection | DOM scraping → PII filter → API | Between rendering & API |
| Transport | WebRTC → ICE waterfall (host → TURN/UDP → TURN/TCP) | DTLS + Noise |
| Server | Signaling (Socket.IO) + TURN (Coturn) | Cloud |
| WebAuthn | PRF + credential creation `auth.html` | OS authenticator |

---

## Phase 2: Entry-by-Entry Analysis

### TIER 1 — DIRECTLY APPLICABLE

---

#### 1. NGate (NFC Relay Attack)

**Relevance: CRITICAL**

NGate implements NFC relay against HandyPay (Android payment app). SmartID2's pairing flow has an isomorphic structure:

```
NGate:        Terminal ←[NFC]→ Android (relay) → Attacker ←[network]→ HandyPay
SmartID2:     Browser  ←[WebRTC]→ Extension    → Phone   ←[Noise]→  Companion App
```

The relay attack pattern applies directly. In NGate, the victim's NFC card data is relayed through a malicious app to the attacker's device. In SmartID2, the WebRTC data channel relays commands (transaction authentication, credential delivery) from browser to phone. If an attacker can inject into the QR/pairing flow (e.g., via a fake QR code in a phishing page), they could relay unauthorized transactions.

**Concrete code touchpoints:**
- `lib/channel/noise.ts` — XX handshake uses `pendingRemoteStaticPk` extracted during handshake.
- `entrypoints/background/pairingCoordinator.ts:283` — `confirmSasMatch()` completes pairing by caching the remote static key. No validation that the remote key corresponds to the intended phone — only SAS comparison. If an attacker completes a parallel XX handshake and the user blindly confirms SAS (a known UX failure pattern), the pairing binds to the attacker.
- `lib/channel/noiseTypes.ts` — `CachedPairing` stores `localStaticKey`, `remoteStaticPublicKey`, `handshakePattern`, and `pairedAt` — no device identity binding beyond ephemeral Noise keys.

**Recommendation:** Add `deviceId` and `sasConfirmedAt` fields to `CachedPairing`. The `deviceId` is SHA-256(remoteStaticPublicKey)[:8], checked on reconnection to prevent relay-based key substitution.

---

#### 2. EtherRAT / EtherHiding (Blockchain C2)

**Relevance: HIGH**

EtherRAT polls Ethereum smart contracts for encrypted C2 URLs. SmartID2's `lib/transaction/transactionDetector.ts` and its LHV detector (`lib/transaction/detectors/lhvDetector.ts`) scrape DOM for transaction amounts, recipients, and IBANs. The intersection:

- **Transaction anomaly detection**: If a banking page contains blockchain contract addresses or unusual RPC calls mixed with payment confirmation elements, it could signal compromise via blockchain-injected malware.
- **Ethereum address pattern recognition**: Add `0x[a-fA-F0-9]{40}` to the PII filter's pattern set as a risk indicator.

**Concrete code touchpoint:** `lib/piiFilter.ts:28-54` — `PATTERNS` record has no blockchain entity patterns.

**Recommendation:** Add `BlockchainAddress` to `PiiCategory` as a monitoring category (non-redacting, but flagged in `FilteredContent.categories` so the background can trigger step-up auth).

---

#### 3. Evelyn Stealer / GlassWorm (Dev Tool Supply Chain)

**Relevance: HIGH (development pipeline) + MEDIUM (product threat model)**

These malware specifically target developer VS Code environments. For the extension:

- **Build pipeline risk**: `wxt.config.ts` could be poisoned → malicious builds with backdoored Noise key generation.
- **Runtime credential risk**: The stealer extracts browser credentials. SmartID2 stores Noise keypairs in `browser.storage.session` which is accessible to any extension with `storage` permission. A malicious extension or compromised dev environment could exfiltrate these keys.

**Concrete code touchpoint:** `lib/channel/noise.ts:119-123` — `deriveNoiseKeypair()` computes publicKey via `INTERNALS.dh.x25519.scalarMultBase`. No integrity verification on deserialization.

**Recommendation:** Add `keyIntegrityCheck()` that validates a deserialized keypair by recomputing publicKey = scalarMultBase(secretKey) and comparing. Call on every `localStaticKey` load from storage.

---

### TIER 2 — ARCHITECTURALLY RELEVANT

---

#### 4. BYOVD (Bring Your Own Vulnerable Driver)

**Relevance: MEDIUM-HIGH**

The BYOVD repo catalogs known vulnerable drivers. SmartID2 assumes the OS and browser provide a trusted execution environment. BYOVD breaks this:

- A kernel driver could read `browser.storage.session` memory from kernel space.
- Could hook WebAuthn API calls to intercept PRF assertions (`lib/crypto/fallbackAuth.ts`).
- Could tamper with Noise protocol packets before DTLS encryption.
- The `entrypoints/offscreen-webrtc/main.ts` offscreen document is particularly exposed — it handles raw WebRTC SDP/ICE and decrypted Noise packets.

**Recommendation:** Add a startup integrity check in `entrypoints/background/main.ts` that verifies `chrome.runtime.getManifest()` content hash hasn't been tampered and optionally cross-references the BYOVD repo for known vulnerable drivers.

---

#### 5. Windows Auth Bypass (Kerberos/SMB — CVE-2026-26128/24294)

**Relevance: MEDIUM**

WebAuthn on Windows delegates to Windows Hello which involves the TPM and Kerberos. CVE-2026-26128 (Kerberos coercion) could allow an attacker to force a Kerberos ticket that bypasses WebAuthn's authentication intent. `entrypoints/auth/main.ts` handles WebAuthn PRF credential creation and assertion — if the WebAuthn API is bypassed at the OS level, the extension's authentication guarantees collapse.

**Recommendation:** Document in the threat model that SmartID2 inherits WebAuthn's OS-level trust assumptions. Add a platform check in `entrypoints/auth/main.ts` that warns on known vulnerable Windows builds.

---

#### 6. Data Exfiltration via Cloud Storage (rclone)

**Relevance: MEDIUM**

The project's `lib/piiFilter.ts` is the data loss prevention layer. The rclone exfiltration guide reveals gap patterns:

- rclone config files (`.conf` with `type =` directives, `access_key_id`, `secret_access_key`)
- Cloud storage URLs for Mega.io, S3, GCS
- `attrib +h` hiding technique — the PII filter doesn't detect hidden file markers

**Recommendation:** Add to `PATTERNS` in `lib/piiFilter.ts`:

```typescript
[PiiCategory.CloudKey]: /(?:aws_access_key_id|secret_access_key|mega\.nz|rclone\s+config)/gi,
```

---

#### 7. cPanel CRLF Injection (CVE-2026-41940)

**Relevance: MEDIUM**

CRLF injection applies at:

1. **DOM scraping**: Not a threat — content scripts read `document.body.innerText` which is already rendered (browser normalizes HTTP responses).
2. **Signaling server**: Room IDs and SAS codes are passed through Socket.IO. If the server logs or reflects user input without sanitization, CRLF injection could occur.

**Recommendation:** The SAS code in `lib/channel/qrCode.ts:6-13` is 6-digit numeric — inherently safe. Audit the signaling server for reflected input in logs and error messages.

---

### TIER 3 — TACTICAL / OFFENSIVE-SEC

---

#### 8. VM Blacklist

**Relevance: MEDIUM (anti-fraud)**

The VM blacklist repo contains hardware signatures for sandbox/VMs. SmartID2 can use this for step-up authentication:

- If the extension detects VM hardware (VMware MAC prefix `00:50:56`, VirtualBox PCI vendor `80ee`), escalate transaction verification from emoji SAS to full WebAuthn PRF re-auth.
- The content script (`entrypoints/content/index.ts`) already has `document_idle` timing — adding VM fingerprinting before transaction detection is natural.

**Recommendation:** Inject a `detectSandbox()` check in the `detectTransaction()` caller path in `lib/transaction/transactionDetector.ts`.

---

#### 9. 403 Bypass Tools

**Relevance: LOW-MEDIUM (API testing)**

The API endpoints (signaling server `/turn-credentials`, and any production API) can be tested with these tools. `fetchTurnCredentials()` in `entrypoints/offscreen-webrtc/main.ts:27-42` calls the signaling server URL with an `x-room-id` header — path traversal or header injection testing via 403 bypass tools could reveal access control issues.

---

#### 10. CopyFail Linux LPE (CVE-2026-31431)

**Relevance: LOW (server-side)**

The signaling server (deployed on Fly.io) runs Linux. If a container breakout is achieved via CopyFail, the TURN credentials endpoint could be compromised. Not directly related to the extension codebase but relevant for ops.

---

## Phase 3: Summary Matrix

| KB Entry | Relevance | Attack Surface | Code Touchpoint | Action |
|----------|-----------|---------------|-----------------|--------|
| **NGate** | CRITICAL | Pairing/relay | `pairingCoordinator.ts:283` | Add device binding to `CachedPairing` |
| **EtherRAT** | HIGH | Transaction detection | `transactionDetector.ts`, `piiFilter.ts` | Add blockchain entity patterns |
| **Evelyn Stealer** | HIGH | Dev pipeline + key storage | `noise.ts:119`, `browser.storage.session` | Key integrity check on deserialization |
| **BYOVD** | MED-HIGH | Kernel-level tampering | `background/main.ts`, `offscreen-webrtc/main.ts` | Runtime integrity check |
| **Windows Auth Bypass** | MEDIUM | WebAuthn trust chain | `entrypoints/auth/main.ts` | Platform version check |
| **Data Exfiltration (rclone)** | MEDIUM | PII filter coverage | `piiFilter.ts:28-54` | Add cloud storage patterns |
| **cPanel CRLF** | MEDIUM | Signaling server input | `signaling-server/` | Input validation audit |
| **VM Blacklist** | MEDIUM | Anti-fraud | `transactionDetector.ts` | VM detection for step-up auth |
| **403 Bypass** | LOW-MED | API security | `offscreen-webrtc/main.ts:27` | API endpoint testing |
| **CopyFail LPE** | LOW | Server infrastructure | `signaling-server/` deployment | Container hardening |
| **DeadMatter** | LOW | Credential storage model | `noiseTypes.ts` (CachedPairing) | Document threat model assumption |
| **macOS Spotlight** | LOW | macOS persistence | N/A | Awareness only |
| **AD Initial Access** | LOW | Enterprise deployment | N/A | Awareness only |
| **LLM Internals** | LOW | Not applicable | N/A | N/A |

---

## Archive File 3: EDR Weaponization, Supply Chain Injection & Infrastructure Hardening

### Entry Map

| KB Entry | Relevance | Attack Surface | Code Touchpoint | Action |
|----------|-----------|---------------|-----------------|--------|
| **RedSun / UnDefend / BlueHammer** | CRITICAL | OS-level EDR weaponization | `entrypoints/background/index.ts:20` | Add startup platform integrity check |
| **Nekogram Spyware** | HIGH | Build pipeline / CI/CD | `package.json:9` (build chain) | Post-build checksum verification |
| **Vibe Coder Checklist** | HIGH | Signaling server deployment | `signaling-server/` | Infrastructure hardening audit |
| **Frida / PhoneSploit** | HIGH | Companion Android app | Android app Noise key storage | Verify NDK enclave for key material |
| **W3LL Phishing Kits** | MEDIUM | Transaction detector integrity | `lhvDetector.ts`, `apiRelay.ts` | Server-side origin validation |
| **PHP Composer RCE** | MEDIUM | Supply chain / npm deps | `.github/workflows/test.yml` | `--frozen-lockfile` in CI |
| **ExportHider** | LOW | Not applicable (no DLLs) | N/A | Awareness only |
| **Adobe Acrobat PP** | LOW-MED | Zustand store pollution | `lib/store.ts` | Review spread on untrusted data |
| **Web Recon Tools** | LOW | Not applicable | N/A | Awareness only |
| **AI Ad Fraud** | LOW | Outside scope | N/A | Awareness only |
| **Self-Hosted Infra** | LOW-MED | Ops resilience | `docs/wip-plan.md` | Document as alternative |

---

## Phase 1 (Archive 3): Project Surface Mapping

| KB Focus Area | SmartID2 Surface | Overlap Severity |
|---------------|-----------------|------------------|
| OS-level EDR weaponization | `entrypoints/background/index.ts` (startup), `entrypoints/offscreen-webrtc/main.ts` (trusted execution) | CRITICAL — extension security model inherits OS trust |
| Supply chain / build pipeline | `package.json` build chain → `wxt build` → `fix-manifest.js` | HIGH — single mutable post-build step, no artifact integrity |
| Mobile instrumentation | Companion Android app (Noise key storage, WebRTC, WebAuthn) | HIGH — Noise private keys on device are root of trust |
| Infrastructure hardening | Signaling server (Socket.IO), TURN (Coturn), Fly.io deploy | MEDIUM |

---

## Phase 2 (Archive 3): Entry-by-Entry Analysis

### TIER 1 — CRITICAL / DIRECT

---

#### 11. Windows Defender Zero-Day Chain (RedSun / UnDefend / BlueHammer)

**Relevance: CRITICAL**

Three exploits forming a complete kill chain against the extension's host environment:

```
BlueHammer (CVE-2026-33825 LPE) → UnDefend (disable signatures, no admin required) → RedSun (weaponize Defender → Oplock race → write malicious DLL to System32)
```

**Why this maps directly to SmartID2:**

The extension's architectural assumption (ARCHITECTURE.md) is that the browser sandbox provides sufficient isolation. `wxt.config.ts:33` permissions are minimal — but none protect against OS-level compromise. This chain breaks every OS-level trust assumption.

**RedSun specifics** — a paradigm shift: instead of bypassing EDR, it makes the EDR **execute the attacker's payload**. The Oplock/Junction technique:
1. Creates a malicious file with an OpLock (opportunistic lock)
2. When Defender opens it for scanning, the OpLock triggers
3. The file path is replaced with a junction pointing to `C:\Windows\System32`
4. Defender writes the scanned (now attacker-controlled) content to System32 as a trusted system file

**Attack chain against SmartID2:**
```
1. BlueHammer → LPE to kernel
2. UnDefend → disable Defender so no AV alerts
3. RedSun → plant Chrome-trusting DLL in System32
4. DLL loaded by chrome.exe → read extension storage (Noise keys, session data)
5. Intercept WebAuthn API calls → steal PRF credentials
6. Monitor WebRTC DTLS channel → capture Noise handshake packets
```

**Concrete code gaps:**
- `entrypoints/background/index.ts:20-45` — zero startup integrity checks. No `chrome.runtime.getPlatformInfo()`, no Defender status probe, no runtime integrity self-check
- `wxt.config.ts:48-57` — CSP is the only defense-in-depth. No platform-level hardening
- The extension has **no awareness** of whether its host environment is compromised

**Recommendation:** Add a startup integrity module that:
- Calls `chrome.runtime.getPlatformInfo()` on every service worker wake
- Probes Windows Defender status via `WMIC` or `powershell Get-MpComputerStatus`
- Verifies extension file hashes against expected values from build manifest
- Logs warnings if security software is disabled, stale, or absent

---

#### 12. Nekogram Spyware (Build-Time Injection)

**Relevance: HIGH**

The critical detail: *"malicious code is NOT in the public GitHub source, only in the compiled build."*

This maps directly to SmartID2's build chain:

```
package.json build: validate-env.ts → wxt build → [fix-manifest.js]  ← POST-BUILD MUTATION
```

The `fix-manifest.js` step runs after `wxt build` and **modifies the build output**. This post-build mutation is architecturally identical to the Nekogram attack vector:
- A single script that adjusts the manifest
- Could be extended to inject malicious code into build artifacts
- No integrity check verifies that the final `.output/chrome-mv3/` matches what source would produce
- No reproducible build configuration exists — two builds of the same commit are not guaranteed identical

**Concrete code touchpoint:** `package.json:9` — `"build": "bun run prebuild && wxt build && node fix-manifest.js"`
**Secondary vector:** `salty-crypto` (Noise implementation) is a native module and a single point of failure for the entire security model. A compromised `postinstall` script or package could backdoor the Noise implementation without being visible in SmartID2's own source.

**Recommendation:**
1. Add `integrity` hashes to `wxt.config.ts` for build output validation
2. Implement a post-build checksum step that compares `.output/` against a manifest of expected hashes
3. Pin all dependencies to specific versions with lockfile verification in CI (`bun install --frozen-lockfile`)
4. Audit `fix-manifest.js` — consider inlining its logic into the WXT config to eliminate the post-build mutation

---

#### 13. Vibe Coder Security Checklist

**Relevance: HIGH (infrastructure hardening)**

A comprehensive pre-ship checklist covering **Auth, API, DB, Infrastructure** — the exact surface of SmartID2's non-extension components:

| Checklist Item | SmartID2 Equivalent | Current State |
|---------------|---------------------|---------------|
| Bcrypt/Argon2 | Signaling server auth | SAS-based room auth only (no password hashing) |
| HttpOnly cookies | TURN credential session | `scripts/validate-env.ts` checks TURN vars but no cookie hardening |
| Parameterized SQL | Coturn PostgreSQL storage | Unknown — depends on Coturn deployment config |
| VPC isolation | Fly.io deployment | Unknown at project level |
| `.env` auditing | `scripts/validate-env.ts` | Done — validates required/optional env vars |
| Pre-ship review | CI/CD pipeline | `ci:check` runs typecheck+test+build but no security scan |

**Recommendation:** Integrate the checklist into `docs/wip-plan.md` as an infrastructure section. Add a `scripts/preflight-security.ts` that runs checklist checks before every deployment.

---

#### 14. Mobile Pentesting (PhoneSploit / Frida)

**Relevance: HIGH (companion Android app)**

Frida can hook Java methods at runtime in Android apps. The SmartID2 companion app:
- Stores Noise XX/IK keypairs
- Performs Noise DH operations (via `salty-crypto`)
- Displays emoji SAS for user verification
- Handles WebAuthn PRF assertions

If Noise private keys reside in Java heap (not NDK native memory), Frida can extract them via `Frida.spawn()` + method hooking on `KeyPairGenerator.generateKeyPair()` or the Noise DH functions.

**Architectural gap:** The openspec mentions an NDK enclave (`openspec/changes/ndk-enclave-pin-vault/`) for V6, but the current phase may not have this. Without the NDK enclave, `salty-crypto`'s key operations run in the Android app's Java process — the same process Frida can instrument.

**Recommendation:** Verify that `salty-crypto`'s key generation in the Android app uses native memory (`DirectByteBuffer` or similar), not Java heap. Add a `android.os.Debug.isDebuggerConnected()` self-check in the Android app's Noise initialization.

---

### TIER 2 — RELEVANT (defense-in-depth / testing)

---

#### 15. W3LL Phishing Toolkits

**Relevance: MEDIUM (transaction detection integrity)**

`lib/transaction/detectors/lhvDetector.ts` uses DOM selectors to extract transaction data. W3LL phishing kits create pixel-perfect banking page clones. A phishing kit could include the exact DOM structure the LHV detector expects — the detector would extract "transaction" data from a fake page and relay it to the API.

**Current protection:** The content script matches `['*://*.lhv.ee/*']` — but a phishing site at `lhv-secure.com` or with URL path obfuscation could match this pattern.

**Recommendation:** Add server-side validation of detected transactions. The API should verify the reported origin via WebAuthn assertion context or require phone-side confirmation (via Noise channel) before accepting transaction data.

---

#### 16. PHP Composer Command Injection (CVE-2026-40176 / CVE-2026-40261)

**Relevance: MEDIUM (supply chain)**

While SmartID2 doesn't use PHP/Composer, the principle of **dependency management RCE** maps to:
- `bun install` can run arbitrary `postinstall` scripts from npm packages
- `salty-crypto` is a native module — its install script could be compromised
- CI `ci:check` runs `bun install` without `--ignore-scripts` or `--frozen-lockfile` protection

**Recommendation:** Add `--frozen-lockfile` to CI install commands. Audit `salty-crypto`'s install process for any `postinstall` scripts.

---

#### 17. Adobe Acrobat Prototype Pollution (CVE-2026-34621)

**Relevance: LOW-MEDIUM**

The popup's Zustand store (`lib/store.ts`) and auth page (`entrypoints/auth/main.ts`) are React components. Prototype pollution in their runtime could manipulate extension state.

**Mitigation:** Content script isolated worlds prevent page-level prototype pollution from reaching the extension. However, the offscreen document (`entrypoints/offscreen-webrtc/main.ts`) and the auth page could be exposed if they process attacker-controlled data through object spreads.

**Recommendation:** Review `lib/store.ts` for pattern `{ ...spread }` operations on untrusted data that could be polluted.

---

### TIER 3 — SUPPLEMENTARY

---

#### 18. Self-Hosted Infrastructure Alternatives (Coolify, RustDesk, SMS Gateway)

**Relevance: LOW-MEDIUM (ops)**

- **Coolify**: Could self-host the signaling server instead of Fly.io — reduces third-party dependency
- **RustDesk**: Relevant if SmartID2 needs remote device support for enterprise deployments
- **SMS Gateway (Android)**: Could serve as a fallback notification channel when FCM is unavailable — adds resilience to the transaction verification flow

**Recommendation:** Document these as options in `docs/wip-plan.md` under infrastructure resilience.

---

#### 19. ExportHider (DLL Export Hiding)

**Relevance: LOW**

Technique for hiding DLL export tables to complicate AV/EDR static analysis. SmartID2 is a browser extension (JavaScript/TypeScript), not a native DLL. Not directly applicable.

---

#### 20. Web Reconnaissance Tools (RECOX, altdns, dnsgen, gotator)

**Relevance: LOW**

Subdomain permutation + resolution toolchains. Not relevant to the extension's architecture.

---

#### 21. AI-Driven Ad Fraud (Pushpaganda)

**Relevance: LOW**

AI-generated content forcing notification opt-ins on Google Discover. The extension doesn't have `notifications` permission. Outside current scope.

---

## Phase 3 (Archive 3): Cross-Cutting Synthesis — Three-Layer Failure Cascade

The most critical insight across all Archive 3 entries is a **three-layer failure cascade** where any single breach compromises the E2EE channel:

```
LAYER 1: OS COMPROMISE
  RedSun/BlueHammer/UnDefend → kernel access → memory read → Noise key theft
         │
         ▼
LAYER 2: BUILD COMPROMISE  
  Nekogram vector + fix-manifest.js → backdoored build → poisoned Noise implementation
         │
         ▼
LAYER 3: COMPANION APP COMPROMISE
  Frida instrumentation → Java heap read → Noise private key extraction on Android
```

All three layers target the same crown jewel: **Noise protocol private keys**. If any layer is breached, the E2EE channel is broken.

### Recommended Immediate Actions

| # | Action | KB Entry | Code Touchpoint | Effort |
|---|--------|----------|-----------------|--------|
| 1 | Add startup platform integrity check (OS, Defender, self-hash) | RedSun/UnDefend | `entrypoints/background/index.ts:20` | Medium |
| 2 | Add post-build checksum verification of `.output/` | Nekogram | `package.json:9` (build chain) | Low |
| 3 | Audit `fix-manifest.js` for injection surface | Nekogram | `fix-manifest.js` | Low |
| 4 | Verify companion app Noise keys are in NDK native memory | Frida | Android app source | Medium |
| 5 | Add `--frozen-lockfile` to CI install | Composer RCE | `.github/workflows/test.yml` | Trivial |
| 6 | Add server-side transaction origin validation | W3LL | `entrypoints/background/apiRelay.ts` | High |
| 7 | Apply Vibe Coder checklist to signaling server deployment | Security Checklist | `signaling-server/` | Medium |
| 8 | Integrate Vibe Coder preflight checks into CI | Security Checklist | `scripts/preflight-security.ts` | Medium |
| 9 | Audit Zustand store for prototype pollution patterns | Adobe CVE | `lib/store.ts` | Low |
| 10 | Document self-hosted infra alternatives for resilience | Coolify/RustDesk | `docs/wip-plan.md` | Low |

---

## Archive File 4: Resource Library, Smuggling Tradecraft & URI-Leak Analysis

### Entry Map

| KB Entry | Relevance | Attack Surface | Code Touchpoint | Action |
|----------|-----------|---------------|-----------------|--------|
| **BobTheSmuggler** | HIGH | Content script DOM extraction | `piiFilter.ts`, `domScraper.ts` | Add smuggled-payload heuristics |
| **Telegram OSINT (URI Deep Linking)** | HIGH | Custom URI scheme leak | `qrCode.ts:15-17` (`smartid2-pair://`) | Audit URI scheme for preview leaks |
| **PaaS Provider Map** | MED-HIGH | Signaling server deployment | `wxt.config.ts:8`, `signaling-server/` | Multi-region failover strategy |
| **Client-Side Web Security (JWT/XSS/PP)** | MED-HIGH | Auth page, Zustand store, credentials injection | `auth/main.ts`, `lib/store.ts`, `content/index.ts` | Sanitize store inputs, JWT hardening |
| **Bug Bounty Checklist / Pentestbook** | MEDIUM | Full extension attack surface | `docs/TESTING_PLAN.md` | Formalized security test plan |
| **Malware Analysis Learning Path** | MEDIUM | PII filter pattern coverage | `piiFilter.ts` | Pattern library for TTP matching |
| **Web Recon/Fuzzing Toolchain** | MEDIUM | CI/CD + API security | `.github/workflows/test.yml` | Add trufflehog/gitleaks to CI |
| **Cell Tower Triangulation** | LOW-MED | Companion app privacy | Android app network layer | Document in privacy model |
| **AI Tooling (Finance/Voice/Screen)** | LOW-MED | Transaction augmentation | `transactionDetector.ts` | Potential future integration |
| **DroneSploit** | LOW | Not applicable | N/A | Awareness only |
| **Subway Surfers Pwn (IL2CPP)** | LOW | Not applicable | N/A | Awareness only |
| **OSINT/Dark Web** | LOW | Not applicable | N/A | Awareness only |

---

## Phase 1 (Archive 4): Project Surface Mapping

| KB Focus Area | SmartID2 Surface | Overlap Severity |
|---------------|-----------------|------------------|
| HTML smuggling / payload concealment | Content script DOM extraction (`domScraper.ts`), PII filter (`piiFilter.ts`) | HIGH — smuggled content could hide malicious transaction data from the detector |
| Custom URI scheme leak | `lib/channel/qrCode.ts` (`smartid2-pair://`), pairing flow | HIGH — the SAS code encoded in the URI is the root of trust for pairing |
| Client-side web security | Zustand store, auth page, popup, credential injection | MED-HIGH — prototype pollution, XSS, JWT handling |
| Deployment infrastructure | Signaling server (Fly.io), TURN (Coturn) | MED-HIGH — provider diversity for resilience |
| Security testing methodology | Full extension + server attack surface | MEDIUM — centralized testing checklist |

---

## Phase 2 (Archive 4): Entry-by-Entry Analysis

### TIER 1 — HIGH / DIRECT

---

#### 22. HTML Smuggling (BobTheSmuggler)

**Relevance: HIGH**

BobTheSmuggler embeds encrypted binary payloads inside HTML/SVG/PNG containers using Blob URL reconstruction. The payload is XOR-encrypted, hidden in image files or HTML comments, and reconstructed client-side via JavaScript blobs.

**Connections to SmartID2:**

**A. Content script blind spot.** `entrypoints/content/domScraper.ts:71` extracts `document.body.innerText` — this only captures rendered text. A smuggled payload hidden in:
- SVG `<defs>` or `<metadata>` elements → not in `innerText`
- HTML comments (`<!-- base64... -->`) → not in `innerText`
- XOR-encrypted data in image `src` attributes → not in `innerText`
- Password-protected 7z/ZIP inside a data URI → not in `innerText`

An attacker who compromises a banking page could hide a fake transaction confirmation inside smuggled containers. The transaction detector would see the legitimate page, but the smuggled container could contain altered transaction details that a compromised background script might read via `innerHTML`.

**B. PII filter evasion.** `lib/piiFilter.ts` patterns are regex-based. BobTheSmuggler's XOR-encrypted payloads would not match any PII pattern — the credit card number is XOR'd, base64-encoded, and embedded in a PNG. The filter has zero visibility into binary image content.

**C. Auto-click attack on QR pairing.** BobTheSmuggler's auto-click download trigger is an event that fires without user interaction. If a malicious page uses this technique to trigger `smartid2-pair://` URI scheme navigation, the extension could receive a pairing attempt without user intent. The `extractSasCode()` function in `qrCode.ts:19-25` would parse the URI and initiate pairing.

**Concrete code gaps:**
- `domScraper.ts:71` — only `innerText`, blind to hidden/smuggled DOM content
- `piiFilter.ts:28-54` — no XOR/base64 pattern detection
- `qrCode.ts:15-17` — URI scheme has no origin validation before parsing

**Recommendation:**
1. Add a secondary extraction path in `domScraper.ts` that scans for suspicious Blob URL creations (`URL.createObjectURL`) or data URIs > 1KB in the page context
2. Add base64-encoded-content heuristics to `piiFilter.ts` — any `innerText` segment > 500 chars that is valid base64 should be flagged
3. Validate that pairing URI schemes originate from user gesture (not programmatic auto-click). Check `chrome.runtime.lastError` or use `userActivation` API

---

#### 23. Telegram OSINT & Deep Linking (URI Scheme Leakage)

**Relevance: HIGH**

Telegram's `tg://resolve?domain=<username>` URI scheme leaks user profile data (bio, avatar, phone metadata) without the user joining the group. The attack exploits how browsers and OSes handle custom protocol handlers — link previews, search indexers, and referrer headers all leak the URI content.

**Direct mapping to SmartID2's `smartid2-pair://` scheme:**

`lib/channel/qrCode.ts:15-17`:
```typescript
export function buildPairingUrl(sasCode: string): string {
  return `${PAIRING_SCHEME}://${sasCode}`;
}
```

The SAS code is a 6-digit numeric string (`const chars = '0123456789'`). The QR code encodes this URI and the user scans it with their phone. Here's where the Telegram OSINT technique applies:

| Telegram URI | SmartID2 URI |
|-------------|--------------|
| `tg://resolve?domain=username` | `smartid2-pair://123456` |
| Leaks: bio, avatar, phone | Leaks: 6-digit SAS code |
| Exploit: link preview fetches metadata | Exploit: QR scanner or URL preview logs the code |
| Defense: preview disabling | Defense: short TTL (60s), but still exposed |

**Attack vectors:**
1. **QR code preview caching.** If the browser or OS generates a link preview for `smartid2-pair://` URIs (e.g., Chrome's "manage protocols" dialog), the SAS code is logged in the preview cache
2. **Referrer header leakage.** If the extension's popup navigates to any URL after pairing, the `smartid2-pair://` URI could leak via `document.referrer`
3. **Third-party QR scanners.** If the user uses a non-SmartID2 QR scanner, the URI is captured by a third-party app
4. **Protocol handler registration.** The OS-level handler registration for `smartid2-pair://` could be enumerated by other applications

**Concrete code touchpoint:** `lib/channel/qrCode.ts:15-17` — `buildPairingUrl()` encodes the SAS directly in the URI with no entropy other than the 6 digits (1M combinations). The TTL (`SAS_TTL_MS = 60_000`) limits exposure but doesn't prevent real-time interception.

**Recommendation:**
1. Add a one-time token to the pairing URI that is independent of the SAS code. The URI becomes `smartid2-pair://<token>`, where `<token>` is a random 128-bit value, and the SAS is derived separately for user display. This prevents URI interception from revealing the SAS.
2. Implement referrer policy on any navigation that follows the pairing flow — `<meta name="referrer" content="no-referrer">`
3. Document in the threat model that the QR URI is a sensitive bearer token and stays visible in the popup

---

#### 24. PaaS & Cloud Hosting Provider Map

**Relevance: MEDIUM-HIGH (infrastructure resilience)**

The signaling server is currently hardcoded to Fly.io (`wxt.config.ts:8`). The provider map lists 40+ alternatives with different trade-offs:

| Category | Providers | SmartID2 Use Case |
|----------|-----------|-------------------|
| Current | Fly.io | Signaling server, Socket.IO |
| Self-hosted PaaS | Coolify, CapRover, Dokku | On-prem enterprise deployment |
| Edge Workers | Cloudflare Workers, Deno Deploy | Low-latency TURN credential distribution |
| Alternative PaaS | Railway, Koyeb, Northflank | Geographic failover |
| Static | GitHub Pages, Tiiny Host | Documentation, status page |

**Strategic value:**
- **Vendor lock-in risk**: Single-provider dependency (`smartid2-signaling.fly.dev`) is a single point of failure
- **Geo-latency**: A Fly.io instance in one region adds latency for users in other continents. Edge-based credential distribution could reduce this
- **Enterprise deployments**: Self-hosted options (Coolify, Dokku) allow on-prem signaling for compliance

**Recommendation:**
1. Abstract provider configuration into `wxt.config.ts` environment variables (already partially done with `VITE_SIGNALING_URL`)
2. Add multi-region TURN credential endpoints in `entrypoints/offscreen-webrtc/main.ts` (`fetchTurnCredentials`) — try nearest region first, fallback to others
3. Document self-hosted deployment guide using Coolify or Dokku in `docs/wip-plan.md`

---

#### 25. Client-Side Web Security (JWT, XSS, CSRF, Prototype Pollution, postMessage)

**Relevance: MEDIUM-HIGH**

**A. JWT security.** The auth page (`entrypoints/auth/main.ts:42-58`) uses `atob`/`btoa` for base64 encoding/decoding of WebAuthn data. If JWT tokens are ever handled in the auth flow, the current base64 implementation doesn't validate token structure (no signature check, no expiry before decoding).

- `entrypoints/auth/main.ts:200` — `bufferToBase64(response.authenticatorData)` — currently safe (WebAuthn binary data, not user-controlled JWT)
- Future risk: if API auth uses JWTs, the base64 functions could decode untrusted tokens without validation

**B. XSS in credential injection.** `entrypoints/content/index.ts:79` uses `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set` to inject credentials into login forms. If an attacker-controlled page poisons `HTMLInputElement.prototype.value` via prototype pollution, the native setter could be replaced with a malicious function.

- `entrypoints/content/contentMessageBus.ts:87` — `injectCredentials()` is called with `payload.username` and `payload.password` received via `runtime.sendMessage`. The background script populates these — if the background is compromised, arbitrary values could be injected.

**C. Prototype pollution in Zustand.** `lib/store.ts:75-134` uses Zustand's `set()` which performs shallow merging. None of the individual setters pass user-controlled objects directly — they pass primitives or typed objects. Currently low risk, but any future code that passes untrusted parsed JSON through a setter would be vulnerable.

**Recommendation:**
1. Use `Object.freeze()` on the native setter in `entrypoints/content/index.ts:79` before calling it, to prevent prototype tampering
2. Add JWT validation utilities to `lib/crypto/` if token handling is added
3. Keep Zustand setters type-safe — never pass `unknown` or `any` objects through `set()`

---

### TIER 2 — MEDIUM / TESTING & METHODOLOGY

---

#### 26. Bug Bounty Checklist / Pentestbook

**Relevance: MEDIUM**

These are comprehensive testing checklists (subdomain enumeration → vulnerability scanning → exploitation → reporting). For SmartID2:

- The testing plan (`docs/TESTING_PLAN.md`) could incorporate the Galaxy Bug Bounty Checklist methodology
- The signaling server can be tested against the pentestbook's web-specific sections (API rate limiting, auth bypass, parameter tampering)
- The TURN credential endpoint (`entrypoints/offscreen-webrtc/main.ts:27-42`) should be tested for IDOR — can one user's `sasCode` access another user's credentials?

**Recommendation:** Create a `scripts/security-test.sh` that runs a subset of pentestbook checks against the deployed signaling server pre-release.

---

#### 27. Malware Analysis Learning Path

**Relevance: MEDIUM (PII filter pattern library)**

The categorized malware TTP library (JScript loaders, PowerShell downloaders, NodeJS stealers) provides a pattern reference:

- **JScript downloaders** → add `new ActiveXObject` pattern to PII filter
- **PowerShell loaders** → add `IEX`/`Invoke-Expression` pattern detection
- **NodeJS stealers** → add `process.env` / `fs.readFileSync` pattern detection in scraped code

If the content script detects any of these patterns on a banking page, it could indicate the page is serving malware (browser exploitation kit) rather than a legitimate transaction.

**Concrete code touchpoint:** `lib/piiFilter.ts` — extend `PiiCategory` with `MalwarePattern` for detection (not redaction) of common malware TTP strings in scraped DOM.

---

#### 28. Web Reconnaissance & Fuzzing Toolchain (trufflehog, gitleaks, nuclei)

**Relevance: MEDIUM (CI/CD security)**

| Tool | Purpose | SmartID2 CI/CD Gap |
|------|---------|-------------------|
| `trufflehog` | Secrets scanning | Not in CI pipeline |
| `gitleaks` | Git history secrets | Not in CI pipeline |
| `nuclei` | CVE template scanning | Not run against signaling server |
| `ffuf` | API fuzzing | Not run against `/turn-credentials` endpoint |

**Current CI:** `.github/workflows/test.yml` runs typecheck + test + build. No secrets scanning, no CVE scanning.

**Recommendation:** Add `gitleaks` and `trufflehog` to CI pipeline. Add a monthly `nuclei` scan against the signaling server.

---

#### 29. Cell Tower Triangulation

**Relevance: LOW-MEDIUM (privacy model)**

Passive location tracking via carrier CDR (Call Detail Records) bypasses app-level privacy controls. For SmartID2's companion Android app:

- The app's network requests (WebRTC signaling, TURN polling) generate network traffic visible to the carrier
- Cell tower handoff patterns during pairing could reveal user location
- The Noise protocol encrypts payload content, but metadata (packet timing, size, frequency) is visible

**Recommendation:** Document in the privacy model that network-level metadata leakage is outside the extension's control but visible to ISPs and mobile carriers. Add a metadata section to `docs/wip-plan.md`.

---

### TIER 3 — SUPPLEMENTARY

---

#### 30. AI Tooling (Awesome Finance Skills, VoxCPM2, OpenScreen)

**Relevance: LOW-MEDIUM (future consideration)**

- **Awesome Finance Skills**: If SmartID2 expands into transaction analysis (e.g., detecting fraudulent transactions based on financial data patterns), a financial analysis skill pack could augment the transaction detector
- **VoxCPM2**: Voice cloning — not directly relevant
- **OpenScreen**: Screen recording — could be relevant for debugging transaction flows in the companion app

---

#### 31. DroneSploit

**Relevance: LOW**

Drone exploitation framework. No connection to browser extension security.

---

#### 32. Subway Surfers Pwn (IL2CPP Binary Analysis)

**Relevance: LOW**

AI-assisted reverse engineering of mobile game IL2CPP binaries. Demonstrates AI's capability for binary analysis but not directly applicable to SmartID2's TypeScript/React codebase.

---

#### 33. OSINT / Dark Web Monitoring Tools (TorCrawl, DeepDarkCTI, Onionscan, TorBot, Stalkie)

**Relevance: LOW**

Dark web monitoring toolchain. Not applicable to the extension's threat model — SmartID2 doesn't interact with Tor or dark web services.

---

## Phase 3 (Archive 4): Cross-Cutting Synthesis — URI Leakage & Content Blind Spots

The Archive 4 entries reveal two architectural blind spots not covered by previous archives:

### Blind Spot 1: The URI Bearer Token Problem

```
Telegram OSINT principle: custom URI schemes leak their content through link previews, referrer headers, and OS handler registration.

SmartID2: smartid2-pair://123456 contains the SAS code — the root of trust for pairing.
```

**Risk:** Any component in the chain (QR scanner, OS protocol handler, browser preview, referrer header) leaks the 6-digit SAS. With 1M combinations and a 60-second TTL, a determined attacker who captures the URI can brute-force or race the handshake.

**Fix:** Decouple the transport token from the verification secret. Use a random 128-bit token for the URI. Derive the 6-digit SAS separately for display-only comparison. Even if the URI leaks, the attacker gets only the transport token, not the verification secret.

### Blind Spot 2: Content Extraction Blindness

```
BobTheSmuggler principle: payloads hidden in SVG/PNG/comments are invisible to innerText extraction.

SmartID2: transaction detector reads innerText only — smuggled content is invisible.
```

**Risk:** An attacker who compromises a banking page's JavaScript can inject smuggled containers holding modified transaction details. The detector sees stale legitimate data while the smuggled container holds attacker-controlled values.

**Fix:** Add a secondary extraction pass in `domScraper.ts` that checks for suspicious Blob URL creation and data URI sizes. Flag pages where `innerText` length differs significantly from `innerHTML` length (indicating heavy hidden content).

### Recommended Immediate Actions

| # | Action | KB Entry | Code Touchpoint | Effort |
|---|--------|----------|-----------------|--------|
| 1 | De-couple SAS from transport token in pairing URI | Telegram OSINT | `qrCode.ts:15-17` | Medium |
| 2 | Add referrer policy to pairing flow navigation | Telegram OSINT | `PairingPanel.tsx` | Trivial |
| 3 | Add base64/heuristic smuggled-content detection to DOM extraction | BobTheSmuggler | `domScraper.ts`, `piiFilter.ts` | Medium |
| 4 | Validate pairing URI origin against user gesture | BobTheSmuggler | `qrCode.ts`, `pairingCoordinator.ts` | Low |
| 5 | Abstract signaling provider config for multi-region failover | PaaS Provider Map | `wxt.config.ts`, `offscreen-webrtc/main.ts` | Low |
| 6 | Add `gitleaks` + `trufflehog` to CI pipeline | Web Recon Toolchain | `.github/workflows/test.yml` | Trivial |
| 7 | Create `scripts/security-test.sh` using pentestbook methodology | Bug Bounty Checklist | `scripts/` | Medium |
| 8 | Freeze native setter in credential injection against prototype tamper | Client-Side Security | `content/index.ts:79` | Trivial |
| 9 | Add malware TTP patterns to PII filter as risk indicators | Malware Learning Path | `piiFilter.ts` | Low |
| 10 | Document network metadata leakage in privacy model | Cell Tower | `docs/wip-plan.md` | Low |
