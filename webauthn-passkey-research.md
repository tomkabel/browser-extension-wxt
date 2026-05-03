# WebAuthn/FIDO2/Passkey Research Report for Browser Extension Enhancement

*Generated: 2026-04-30 | Sources: 15+ repositories and articles*

---

## Executive Summary

Adding passkey support to a WXT-based browser extension is highly feasible but requires careful architecture decisions. The core challenge: **browser extensions cannot directly use the WebAuthn API** — they must intercept page-level `navigator.credentials.create()` and `navigator.credentials.get()` calls. This is the pattern used by Bitwarden, 1Password, and the reference projects below.

---

## 1. High-Impact Reference Projects

### FenkoHQ/passkey-vault — Most Relevant Implementation

**Stars**: 5 | **Language**: TypeScript | **License**: MIT

A fully functioning browser extension that intercepts WebAuthn API calls and stores passkeys locally. **This is the single most directly relevant project** for understanding how to implement passkey interception in a Chrome MV3/Firefox MV2 extension.

**Architecture:**

```
Content script injects webauthn-inject.js → overrides navigator.credentials.create/get
                                     ↓
Background script generates ECDSA P-256 key pairs, creates valid attestation responses
                                     ↓
Storage in chrome.storage.local
```

**Key Files:**
- `src/crypto/webauthn.ts` — Core crypto for attestation/assertion creation
- `src/content/content.ts` — WebAuthn interception logic
- `src/background/` — Service worker handling

**Recent Updates (v0.6.0)**: Settings page, domain control, dev tools.

**Repository**: https://github.com/FenkoHQ/passkey-vault

### lxgr/brainchain — Alternative Approach (Stateless)

**Stars**: 6 | **Language**: JavaScript | **License**: GPL-3.0

Interesting research project: implements stateless WebAuthn using deterministic key derivation from a passphrase. Uses non-discoverable credentials to re-derive private keys on-the-fly. **Useful for understanding the cryptographic mechanics**, though not production-ready.

**Key Insight**: Demonstrates that you can implement WebAuthn without storing passkeys — the private key is derived from `SHA-256(rootSecret || credentialId)` each time.

**Repository**: https://github.com/lxgr/brainchain

### agektmr/webauthn-devtools — Debugging Tool

**Stars**: 16 | **Language**: TypeScript | **License**: Apache-2.0

A DevTools extension for auditing WebAuthn interactions. Captures and parses `clientDataJSON`, `attestationObject` (CBOR-decoded), `authenticatorData`, and COSE public keys. **Essential for debugging your implementation**.

**Features**:
- API interception for `navigator.credentials.create/get`
- Visual flag display (UP, UV, BE, BS, AT, ED)
- Export captured calls as JSON
- Virtual authenticator detection

**Repository**: https://github.com/agektmr/webauthn-devtools

---

## 2. Core Libraries for WebAuthn Implementation

### SimpleWebAuthn — Most Popular Library

**Stars**: 2.2K | **Packages**: `@simplewebauthn/server`, `@simplewebauthn/browser`

The standard TypeScript-first library for WebAuthn. The `@simplewebauthn/browser` package can be loaded via UMD script tag for content script injection:

```html
<script src="https://unpkg.com/@simplewebauthn/browser/dist/bundle/index.es5.umd.min.js"></script>
```

**Browser support**: Chrome, Edge, Firefox, Safari.

**Note**: There's an open discussion on using SimpleWebAuthn in Chrome Browser Plugins (#496) — same challenge as your project. The library works but requires handling extension context vs. page context.

**Repository**: https://github.com/MasterKale/SimpleWebAuthn

### @passwordless-id/webauthn — Minimalist Alternative

**Stars**: ~200 | **Client + Server + Demo**

Dependency-free, opinionated WebAuthn library. Supports browser via CDN and CommonJS for Node.js. Good if you want a lightweight custom implementation.

**Repository**: https://github.com/passwordless-id/webauthn

### wevm/webauthx — Newer TypeScript Library

**Stars**: 55 | **TypeScript**

Server ↔ client WebAuthn ceremony orchestration. Registration and authentication helpers with proper type definitions.

**Repository**: https://github.com/wevm/webauthx

---

## 3. Key Technical Insights

### The Extension WebAuthn Challenge

From W3C WebAuthn Issue #1158:

> **"Currently, there is no way to use WebAuthn APIs directly within the browser extension (e.g., Chrome extension)."**

Extensions must work around this by intercepting the page's WebAuthn calls.

### Standard Interception Pattern

```javascript
// In content script injected into page
const originalCreate = navigator.credentials.create.bind(navigator.credentials);
const originalGet = navigator.credentials.get.bind(navigator.credentials);

navigator.credentials.create = async (options) => {
  // Forward to background script, get fake attestation
  const response = await chrome.runtime.sendMessage({ type: 'webauthn-create', options });
  return response;
};
```

### Known Compatibility Issues

| Issue | Details |
|-------|---------|
| **Brave native UI overrides** | Brave's `web-authentication-new-passkey-ui` flag causes native UI to override extension interception. Flag removed in v146+. Issue: brave-browser#37762 |
| **Extension breaks WebAuthn** | Bitwarden issue #17837 — extension causes WebAuthn to fail in entire browser process on Chromium/Linux. Workaround: open DevTools |
| **Conditional Mediation** | Extensions intercepting `mediation: 'conditional'` calls can break native autofill. See W3C/webauthn#1976 |

### Chrome正在开发Extension API

From ChromeDevTools/chrome-devtools-mcp#1004:

> Chrome DevTools MCP team is working on WebAuthn support. There's discussion about `chrome.webauthn` API that would give extensions proper WebAuthn access. This may simplify future implementations.

---

## 4. Comprehensive Source List

| Project | Stars | Relevance | URL |
|---------|-------|-----------|-----|
| wxt | 9.5K | Your framework | github.com/wxt-dev/wxt |
| FenkoHQ/passkey-vault | 5 | **Direct implementation reference** | github.com/FenkoHQ/passkey-vault |
| SimpleWebAuthn | 2.2K | Primary library | github.com/MasterKale/SimpleWebAuthn |
| agektmr/webauthn-devtools | 16 | Debugging tool | github.com/agektmr/webauthn-devtools |
| lxgr/brainchain | 6 | Cryptographic patterns | github.com/lxgr/brainchain |
| @passwordless-id/webauthn | ~200 | Lightweight alternative | github.com/passwordless-id/webauthn |
| wevm/webauthx | 55 | Newer library | github.com/wevm/webauthx |
| Bitwarden clients | — | Production reference | github.com/bitwarden/clients |
| webauthn-open-source/fido2-lib | — | Server-side Node.js lib | github.com/webauthn-open-source/fido2-lib |
| lbuchs/WebAuthn | 572 | PHP server library | github.com/lbuchs/WebAuthn |

---

## 5. Recommended Implementation Approach

Based on the research, here's the recommended path for adding passkey support:

### Phase 1: Core WebAuthn Interception

1. **Use `FenkoHQ/passkey-vault`** as your primary reference implementation
2. **Implement content script** that injects at `document_start` and overrides `navigator.credentials.create/get`
3. **Use Web Crypto API** (`crypto.subtle`) for ECDSA P-256 key generation and signing
4. **Build attestation object** with proper CBOR encoding for `authData`

### Phase 2: Storage & Management

1. **Use `chrome.storage.local`** for passkey storage (same pattern as passkey-vault)
2. **Consider encryption** at rest with master password (passkey-vault v0.5.0+ has encrypted storage)
3. **Add export/import** functionality for backup

### Phase 3: UI Integration

1. **Build popup UI** for viewing/managing stored passkeys
2. **Add options page** for configuration
3. **Consider emergency access page** (standalone HTML like passkey-vault)

### Phase 4: Advanced Features

1. **PRF extension support** — Allows derivation of additional keys
2. **Cross-device sync** — passkey-vault uses Nostr with BIP-39 seed phrase
3. **Domain allowlist/blocklist** — Control which sites trigger interception

---

## 6. Key Code Reference

**Attestation Object Creation** (from passkey-vault's `src/crypto/webauthn.ts`):

```typescript
// Authenticator data structure:
// - RP ID hash (32 bytes)
// - Flags (1 byte) - bit 6 set for attested credential data
// - Counter (4 bytes)
// - Attested credential data (variable)
//   - Credential ID length (2 bytes)
//   - Credential ID
//   - Credential public key (COSE format)

// Create attestation object in CBOR format
function createAttestationObject(credentialId: Uint8Array, coseKey: Uint8Array): ArrayBuffer {
  const rpIdHash = new Uint8Array(32);
  const flags = new Uint8Array([0x41]); // UP + attestation data present
  const counterBytes = new Uint8Array(4);
  new DataView(counterBytes.buffer).setUint32(0, 0, false);

  // ... assemble authData with proper offsets
  return authData.buffer;
}
```

**Assertion/Signing** (from passkey-vault):

```typescript
export async function createAssertion(
  challenge: string,
  origin: string,
  credentialId: Uint8Array,
  privateKey: CryptoKey,
  counter: number = 0
): Promise<{
  assertionObject: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  authenticatorData: ArrayBuffer;
}> {
  const clientData = {
    type: 'webauthn.get',
    challenge: challenge,
    origin: origin,
  };
  const clientDataJSON = new TextEncoder().encode(JSON.stringify(clientData));

  // Create authenticator data
  const rpIdHash = new Uint8Array(32);
  const flags = new Uint8Array([0x01]); // UP (User Present)
  const counterBytes = new Uint8Array(4);
  new DataView(counterBytes.buffer).setUint32(0, counter, false);

  // Sign the data (authenticatorData + hash of clientDataJSON)
  const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataJSON);
  const signatureBase = new Uint8Array(authenticatorData.length + clientDataHash.byteLength);
  // ... assemble and sign

  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    signatureBase
  );

  return {
    assertionObject: signature,
    clientDataJSON: clientDataJSON.buffer,
    authenticatorData: authenticatorData.buffer,
  };
}
```

---

## 7. Documentation & Learning Resources

- [WebAuthn Specification](https://w3.org/TR/webauthn-3/)
- [SimpleWebAuthn Documentation](https://simplewebauthn.dev/docs)
- [Adam Langley's Tour of WebAuthn](https://www.imperialviolet.org/tourofwebauthn/tourofwebauthn.html) — Highly recommended deep dive
- [Yubico Passkey Workshop](https://yubicolabs.github.io/passkey-workshop/docs/fundamentals/fido2)
- [COSE Algorithm Registry](https://www.iana.org/assignments/cose/cose.xhtml)

---

## Summary

**Highly Feasible**: Adding passkey/WebAuthn support to your WXT extension is well-documented and multiple reference implementations exist.

**Primary Reference**: Clone and study [FenkoHQ/passkey-vault](https://github.com/FenkoHQ/passkey-vault) — it solves exactly the problem you're tackling.

**Key Challenge**: Extensions must intercept page WebAuthn calls rather than calling the API directly. The pattern is proven but has browser compatibility quirks (especially Brave).

**Library Recommendation**: Use `@simplewebauthn/browser` for ceremony logic, implement custom interception layer.

**Additional Value**: Consider also implementing `agektmr/webauthn-devtools`-style debugging support in your extension for internal use.