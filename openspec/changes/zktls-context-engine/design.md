## Context

TLS binding proof is the cryptographic attestation that the extension's browser genuinely navigated to the transaction page and received the server's response. It replaces the monolithic "zkTLS proof" concept with a progressive three-tier system, where each tier provides stronger guarantees with increasing infrastructure requirements.

### Three-Tier Progressive System

The key insight is that browser security headers (`Sec-Fetch-*`) are immutably set by the browser's HTTP network stack, NOT by page-level JavaScript. A RAT executing in the renderer process cannot modify or forge these headers. This provides a "browser-level" attestation that requires zero infrastructure changes — the browser does the work for free.

The tiers are:

```
Tier 1 (Always Available)
  ├── Captures: Sec-Fetch-Site, Sec-Fetch-Dest, Sec-Fetch-Mode
  ├── Source: chrome.webRequest.onHeadersReceived (main_frame)
  ├── Proof: Immutable browser network stack headers + SHA-256(page content hash)
  └── Latency: <5ms, synchronous with page load

Tier 2 (When RP Supports)
  ├── Captures: TLS Channel ID / Token Binding
  ├── Source: WebTransport to /.well-known/token-binding
  ├── Proof: Cryptographically binds extension's TLS session to the RP's session
  └── Latency: <50ms

Tier 3 (Bank Cooperation + WASM)
  ├── Captures: SmartID-Attestation response header + TLS session oracle
  ├── Source: ECDSA P-256 signed header verification + DECO WASM prover
  ├── Proof: Bank-level cryptographic signature + MPC-verified TLS observation
  └── Latency: 1-2s (cached per-session)
```

## Goals / Non-Goals

**Goals:**
- Tier 1 Sec-Fetch header capture: zero-infra, always-available browser-level attestation
- Tier 2 Token Binding: transport-level cryptographic TLS session binding
- Tier 3 SmartID-Attestation header verification: bank-level ECDSA P-256 signed attestation
- Tier auto-negotiation: highest tier available is used, graceful degradation
- Control code verification: cross-reference attested code with DOM-scraped code
- Trusted RP signing key management: bundle, rotate, and update ECDSA P-256 public keys
- Proof caching: per-session cache of expensive Tier 3 proofs

**Non-Goals:**
- Full TLSNotary MPC prover (replaced by progressive three-tier system)
- DECO WASM oracle in critical path (deferred to Phase 3, separate from Tier 1/2)
- Bank-side key generation (banks generate their own signing keys)
- Certificate transparency or revocation checking of TLS certificates

## Decisions

### Decision 1: Tier 1 Sec-Fetch Header Capture

The extension registers a `chrome.webRequest.onHeadersReceived` listener with `{ urls: ['<all_urls>'], types: ['main_frame'] }`:

```typescript
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const secFetchSite = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'sec-fetch-site'
    )?.value;
    const secFetchDest = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'sec-fetch-dest'
    )?.value;

    // Store per-tabId in chrome.storage.session
    storeSecFetchHeaders(details.tabId, {
      site: secFetchSite ?? 'unknown',
      dest: secFetchDest ?? 'unknown',
      mode: secFetchMode ?? 'unknown',
      timestamp: details.timeStamp,
    });
  },
  { urls: ['<all_urls>'], types: ['main_frame'] },
  ['responseHeaders'],
);
```

For SPA navigations (no new `main_frame` request), the `wxt:locationchange` event triggers a content hash recomputation that reuses the existing stored Sec-Fetch headers.

### Decision 2: Content Hash Binding

To detect DOM mutations by a RAT, the extension computes SHA-256 of the visible page text:

```typescript
async function computePageContentHash(tabId: number): Promise<Uint8Array> {
  const result = await browser.tabs.sendMessage(tabId, {
    type: 'compute-content-hash',
  });
  return new Uint8Array(result.hash);
}
```

The content hash is included in the TLS binding payload. If a RAT modifies the DOM after the user authenticates, the content hash changes, breaking the binding.

### Decision 3: Tier 2 WebTransport Token Binding

When the RP supports `/.well-known/token-binding`, the offscreen document establishes a WebTransport connection:

```typescript
async function captureTokenBinding(rpHost: string): Promise<Uint8Array> {
  try {
    const wt = new WebTransport(`https://${rpHost}/.well-known/token-binding`);
    await wt.ready;
    const reader = wt.datagrams.readable.getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    wt.close();
    return new Uint8Array(value!.buffer);
  } catch {
    return new Uint8Array(0); // Tier 2 unavailable, degrade gracefully
  }
}
```

### Decision 4: Tier 3 Signed Header Preservation

The existing `SmartID-Attestation` header verification (ECDSA P-256 via `crypto.subtle.verify()`) is preserved as the Tier 3 mechanism. The header format remains:

```
SmartID-Attestation: v1;<base64url(json-payload)>;<base64url(signature)>;<key-id>
```

The WASM DECO oracle is added as an optional augmentation for banks that don't support the signed header approach. Proofs are cached per-session with a session-scoped LRU cache (max 5 entries).

### Decision 5: Tier Auto-Negotiation

At challenge time, the extension attempts tiers from highest to lowest:

```
1. If RP policy in manifest requires Tier 3 → try Token Binding + WASM oracle
2. If RP has Token Binding endpoint → try WebTransport (Tier 2)
3. Always fallback to Sec-Fetch headers (Tier 1)
4. Encode chosen tier in challenge version byte
```

The Android Vault enforces the minimum tier per RP domain. If the proof is below the minimum, the session is rejected.

### Decision 6: Proof Caching

Tier 3 proofs involve WASM computation (1-2s). These are cached per-session:

```typescript
const proofCache = new Map<string, { proof: Uint8Array; expiresAt: number }>();
const PROOF_CACHE_TTL_MS = 30_000;
const PROOF_CACHE_MAX = 5;
```

Cache key = `rpDomain:tabId:pageUrl`. Expired entries are evicted lazily on read.

## Alliance with Challenge-Bound WebAuthn

The TLS binding proof is the first input to the challenge derivation (version 0x02):

```
Challenge = SHA-256(TlsBindingProof || Origin || Control_Code || Session_Nonce)
```

The `challenge-bound-webauthn` change consumes this proof. Separating the concerns:
- **This change (zktls-context-engine)**: Generates the TLS binding proof from whatever tier is available
- **challenge-bound-webauthn**: Incorporates the proof into the WebAuthn challenge and verifies the assertion

## Risks / Trade-offs

- [Risk] Tier 1 Sec-Fetch headers are not available in all browser contexts (e.g., extension pages, `data:` URIs) — Filter to `http://` and `https://` URLs only. For non-HTTP schemes, degrade to Tier 0 (no TLS binding, require Tier 2+).
- [Risk] `Sec-Fetch-Dest: document` may not be present on all navigation types — Some redirect chains strip headers. Mitigation: use `Sec-Fetch-Site` as primary signal; `Sec-Fetch-Dest` is secondary.
- [Risk] Tier 2 WebTransport may not be available in all Chrome versions — Check `typeof WebTransport !== 'undefined'` before attempting. Degrade gracefully to Tier 1.
- [Risk] Tier 3 WASM oracle has ~2MB bundle impact — Load on-demand only when RP policy requires Tier 3. Use dynamic `import()` in offscreen document.
- [Risk] Signed header bank coordination is slow — Tier 1/2 provide meaningful security without bank changes. Tier 3 is an enhancement, not a requirement.
- [Trade-off] Content hash detects DOM mutations but not all RAT vectors — A sophisticated RAT could intercept the content hash computation. Combined with Sec-Fetch headers, the attack surface is dramatically reduced.
