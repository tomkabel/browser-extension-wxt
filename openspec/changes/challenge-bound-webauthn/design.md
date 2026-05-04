## Context

Challenge-Bound WebAuthn is the cryptographic mechanism that fuses network truth (TLS binding), human intent (PC biometric), and transaction context (control code) into a single unforgeable assertion. The WebAuthn challenge parameter — normally a random server-generated nonce — becomes a deterministic hash of all three sources:

```
Challenge = SHA-256(TlsBindingProof || Origin || Control_Code || Session_Nonce)
```

This ensures:
- The biometric verification (Windows Hello/TouchID) is mathematically bound to the specific transaction
- The Android Vault can recompute the same challenge and verify the assertion
- Any tampering with origin, control code, or TLS binding proof invalidates the assertion
- The user's PC biometric cannot be repurposed for a different transaction

### Progressive Proof Tiers

The system implements a three-tier progressive proof architecture. Rather than requiring zkTLS (which depends on bank-side changes and WASM oracles), each tier provides increasing cryptographic guarantees:

| Tier | What It Proves | How | Deployability |
|---|---|---|---|
| **Tier 1** | The browser's network stack witnessed the navigation to the transaction page | Captures `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Dest: document` from `webRequest.onHeadersReceived`. These headers are set by the browser's HTTP stack, NOT by page-level JS — a RAT in renderer context cannot forge them. | Zero infrastructure — works today |
| **Tier 2** | The extension's TLS session is cryptographically bound to the transaction origin | Creates a WebTransport connection to the bank's `/.well-known/token-binding` from the offscreen document. Proves the same TLS termination. | Requires bank to serve `/.well-known/token-binding` endpoint |
| **Tier 3** | MPC-verified TLS session with mathematical proof | Runs a WASM-based DECO/TLSNotary oracle in the offscreen document that observes the bank's HTTP response and produces a succinct proof | Requires notary server deployment, WASM build (~2MB) |

The challenge version byte encodes the tier: `0x01` = Tier 1 only, `0x02` = Tier 1+2, `0x03` = Tier 1+2+3. The Android Vault enforces a minimum tier per RP domain via policy.

## Goals / Non-Goals

**Goals:**
- TLS binding proof derivation via progressive three-tier system (Tier 1 always, Tier 2+3 when available)
- SHA-256 challenge derivation from TLS binding proof, origin, control code, and nonce
- WebAuthn assertion with derived challenge via `navigator.credentials.get()`
- Challenge recomputation on Android after TLS binding proof verification
- Passkey public key provisioning during Phase 0 pairing
- Assertion signature verification on Android using stored Passkey public key
- Serialization of challenge components into canonical binary format (version 0x02)
- Session nonce generation (CSPRNG, 32 bytes)

**Non-Goals:**
- zkTLS proof generation (replaced by progressive TLS binding — previously covered by `zktls-context-engine`, now `tls-binding-engine`)
- PIN processing or enclave operations (covered by `ndk-enclave-pin-vault`)
- PRF-based silent re-auth (separate — used for session resumption, not transaction binding)
- WebAuthn credential management UI

## Decisions

### 1. Challenge Derivation Format

To prevent ambiguity attacks (e.g., hash length extension, delimiter injection), challenge components are serialized using a fixed-length TLV format:

```
┌───────────────────────────────────────────────────┐
│ Version (1 byte) = 0x02                            │
├───────────────────────────────────────────────────┤
│ Tier (1 byte): 0x01 = Sec-Fetch, 0x02 = +Token,   │
│                0x03 = +DECO                        │
├───────────────────────────────────────────────────┤
│ TLS_Binding_Length (2 bytes, big-endian)           │
│ TLS_Binding (variable, up to 4096 bytes)           │
│   Tier 1: { secFetchSite, secFetchDest,            │
│             secFetchMode, contentHash }             │
│   Tier 2: + tokenBindingProof                      │
│   Tier 3: + decoProof                              │
├───────────────────────────────────────────────────┤
│ Origin_Length (2 bytes, big-endian)                │
│ Origin (variable, UTF-8 URL)                       │
├───────────────────────────────────────────────────┤
│ Control_Code_Length (1 byte) = 0x04                │
│ Control_Code (4 bytes, ASCII digits)               │
├───────────────────────────────────────────────────┤
│ Session_Nonce (32 bytes)                           │
├───────────────────────────────────────────────────┤
│ Padding (variable, to next 32-byte boundary)       │
└───────────────────────────────────────────────────┘
Challenge = SHA-256(serialized_bytes)
```

Version 0x02 replaces version 0x01 (which used the now-deprecated monolithic `zkTLS_Proof` field). The version byte allows backward compatibility if the Android Vault encounters an older challenge format (reject with upgrade message).

### 1A. Tier 1 Sec-Fetch Header Capture

The extension captures browser-level security headers during the transaction page navigation:

```typescript
// Captured via chrome.webRequest.onHeadersReceived
const secFetchPayload = {
  site: 'same-origin' | 'same-site' | 'cross-site',
  dest: 'document' | 'iframe' | 'embed',
  mode: 'navigate' | 'same-origin',
  contentHash: await computePageContentHash(tabId),
};
```

These headers are set by the browser's HTTP network stack and CANNOT be modified by page-level JavaScript. A RAT in the renderer process cannot spoof `Sec-Fetch-Site: same-origin` — the browser itself enforces this. The `contentHash` is SHA-256 of the visible DOM text content, which detects DOM mutations.

### 1B. Tier 2 TLS Token Binding

When the RP serves `/.well-known/token-binding`, the offscreen document creates a WebTransport connection to prove the extension's TLS session is the same one serving the transaction page:

```typescript
// In offscreen document
const wt = new WebTransport(`https://${rpHost}/.well-known/token-binding`);
await wt.ready;
const tokenBindingProof = await wt.datagrams.readable.getReader().read();
// Hash into challenge alongside Sec-Fetch headers
```

### 1C. Tier 3 DECO WASM Oracle (Deferred)

The offscreen document runs a lightweight TLS oracle WASM that observes the bank's HTTP response and produces a succinct proof. This is deferred to Phase 3 implementation. The challenge derivation supports it via the version byte without breaking Tier 1/2 assertion verification.

### 2. WebAuthn Assertion Invocation

The extension calls `navigator.credentials.get()` from the popup (user-visible context):

```typescript
const publicKey: PublicKeyCredentialRequestOptions = {
  challenge: derivedChallenge,
  rpId: new URL(origin).hostname,
  allowCredentials: [{
    id: passkeyCredentialId,
    type: 'public-key',
    transports: ['internal', 'usb', 'nfc'],
  }],
  userVerification: 'required',
  timeout: 60_000,
}

const assertion = await navigator.credentials.get({ publicKey })
  as PublicKeyCredential

// Extract:
// - assertion.rawId
// - assertion.response.authenticatorData
// - assertion.response.signature
// - assertion.response.clientDataJSON (contains challenge in base64url)
```

The `clientDataJSON.challenge` (base64url-encoded) is computed from our derived challenge. On Android, the verifier decodes this and compares against the recomputed challenge.

### 3. Passkey Provisioning (Phase 0)

During initial device pairing, the extension creates a WebAuthn credential bound to the extension's origin:

```typescript
const publicKey: PublicKeyCredentialCreationOptions = {
  rp: { id: new URL(chrome.runtime.getURL('/')).hostname, name: 'SmartID Vault' },
  user: {
    id: crypto.getRandomValues(new Uint8Array(32)),
    name: 'SmartID Vault User',
    displayName: 'SmartID Vault',
  },
  challenge: crypto.getRandomValues(new Uint8Array(32)),
  pubKeyCredParams: [{ alg: -7, type: 'public-key' }],  // ES256
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    userVerification: 'required',
    residentKey: 'required',
  },
  extensions: { prf: { eval: { first: new Uint8Array(32) } } },
}

const credential = await navigator.credentials.create({ publicKey })
  as PublicKeyCredential
```

The credential ID and public key bytes are transmitted over the AOA tunnel and stored in the Android trust-store.

### 4. Android-side Verification

The `ChallengeVerifier` performs these steps in order:

```
1. Parse tier byte from challenge TLV
2. Validate tier meets minimum policy for this RP
3. Verify TLS binding proof according to tier:
   - Tier 1: Verify secFetch fields are structurally valid
   - Tier 2: Verify token binding proof matches session
   - Tier 3: Verify DECO proof (notary signature)
4. Extract attested control code + origin from binding proof
5. Recompute: expected_challenge = SHA-256(TLV_serialize(proof, origin, code, nonce))
6. Decode: actual_challenge = base64url_decode(assertion.response.clientDataJSON.challenge)
7. Assert: actual_challenge === expected_challenge
8. Retrieve: passkey_pk = trust_store.lookup(credential_id = assertion.rawId)
9. Verify: ECDSA(passkey_pk, assertion.response.signature, authenticatorData || SHA-256(clientDataJSON))
10. If all pass: session is authorized
```

Steps 3-4 differ by tier. Step 9 uses the standard WebAuthn signature verification (signature covers `authenticatorData || SHA-256(clientDataJSON)`).

### 5. Session Nonce Management

The session nonce is generated by the extension per authentication session:
- 32 cryptographically random bytes via `crypto.getRandomValues()`
- Included in the zkTLS proof metadata (not secret — prevents replay even if zkTLS proof is reused)
- Transmitted alongside the proof and assertion to Android
- The Android Vault checks: nonce must be unique (track recent nonces for replay prevention)

## Risks / Trade-offs

- [Risk] WebAuthn API may not be available in MV3 service worker (must use popup or offscreen document) — Invoke `credentials.get()` from the popup window, which the user opens by clicking the extension icon
- [Risk] Passkey may be deleted or unavailable — Implement fallback: re-provision passkey via Phase 0 pairing flow
- [Risk] `clientDataJSON.challenge` is base64url-encoded — This is an extra decode step on Android; ensure encoding is canonical (no padding differences)
- [Risk] Verifying ECDSA signatures in Java requires Bouncy Castle or Conscrypt — Android's built-in `Signature` class supports SHA256withECDSA; use `KeyFactory` to reconstruct the public key from raw coordinates
- [Trade-off] ES256 (P-256) vs Ed25519 — P-256 is required by WebAuthn spec for platform authenticators; Ed25519 would need extension-level signature abstraction
- [Risk] Tier 1 Sec-Fetch headers are not available on all redirect paths — `webRequest.onHeadersReceived` may fire for subresource loads; filter to `main_frame` type only. On SPA navigations, use `wxt:locationchange` + manual content hash recomputation.
- [Risk] Tier 2 Token Binding endpoint may not exist at the RP — This is expected; the system gracefully degrades to Tier 1 with no user-facing change. Tier 2 is best-effort when the RP adopts the standard.
- [Risk] Tier 3 WASM oracle has ~2MB bundle impact and requires SharedArrayBuffer — Only loaded in the offscreen document when the RP's policy requires Tier 3, otherwise deferred. COOP/COEP headers must be set on the offscreen document. Cached per-session since proofs are expensive.
