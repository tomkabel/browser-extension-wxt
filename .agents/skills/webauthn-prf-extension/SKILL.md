---
name: webauthn-prf-extension
description: WebAuthn PRF (Pseudo-Random Function) extension for silent re-authentication. Covers credential creation with PRF eval, silent mediation, deriving a Noise keypair from PRF output via HKDF, fallback when PRF is unavailable, and browser support matrix.
---

# WebAuthn PRF Extension — Silent Re-Authentication

## When to Use

Apply this skill when:
- Implementing silent session recovery after browser restart or service worker sleep
- Reviewing `lib/crypto/webauthn.ts` or `entrypoints/auth/`
- Handling platforms where PRF is unsupported (iOS < 17, some Windows Hello versions)
- Deriving deterministic cryptographic material from biometric authentication

## Overview

The **PRF extension** (`prf`) allows a WebAuthn authenticator to output a pseudo-random value deterministically derived from:
- A credential-specific secret
- A client-provided "salt"

SmartID2 uses this to:
1. Derive a Noise static keypair from the PRF output
2. Re-establish the phone-as-vault session without a second QR scan
3. Avoid storing long-term secrets in `chrome.storage.local` (SSD)

## Browser Support Matrix

| Platform | Browser | PRF Support | Notes |
|----------|---------|-------------|-------|
| macOS | Chrome 118+ | ✅ Yes | Touch ID / Secure Enclave |
| macOS | Safari 17+ | ✅ Yes | Touch ID |
| Windows | Chrome 118+ | ✅ Yes | Windows Hello (TPM) |
| Windows | Edge 118+ | ✅ Yes | Windows Hello |
| Android | Chrome 118+ | ✅ Yes | Device-bound (StrongBox/TEE) |
| iOS | Safari 17+ | ✅ Yes | Face ID / Touch ID |
| iOS | Chrome | ❌ No | WebKit engine only; Chrome is wrapper |
| Linux | Chrome 118+ | ⚠️ Partial | Software authenticator only |

## Credential Creation with PRF

```typescript
// lib/crypto/webauthn.ts
export async function createCredentialWithPRF(): Promise<PublicKeyCredential> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { name: 'SmartID2', id: location.hostname },
    user: {
      id: userId,
      name: 'smartid-user',
      displayName: 'SmartID2 User',
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Built-in biometric
      userVerification: 'required',
      residentKey: 'required',
    },
    extensions: {
      prf: {
        eval: {
          first: new Uint8Array(32).fill(0x01), // salt for registration
        },
      },
    } as AuthenticationExtensionsPRFInputs,
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;

  // Store credential ID for later assertion
  const clientExtensionResults = credential.getClientExtensionResults() as AuthenticationExtensionsPRFOutputs;
  if (!clientExtensionResults.prf?.enabled) {
    throw new ExtensionError('PRF not supported', 'PRF_NOT_SUPPORTED');
  }

  return credential;
}
```

**Important**: The `prf.eval` at creation time is used to **prove** the authenticator supports PRF. The actual output during creation may not be cryptographically usable in all browsers. Re-evaluate during `get()`.

## Silent Assertion with PRF

```typescript
export async function assertPRFSilent(credentialId: Uint8Array): Promise<Uint8Array> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    userVerification: 'required',
    mediation: 'silent' as CredentialMediationRequirement, // ← no UI if already authenticated
    extensions: {
      prf: {
        eval: {
          first: new TextEncoder().encode('smartid2-vault-salt-v1'),
        },
      },
    } as AuthenticationExtensionsPRFInputs,
  };

  try {
    const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
    const results = assertion.getClientExtensionResults() as AuthenticationExtensionsPRFOutputs;

    if (!results.prf?.results?.first) {
      throw new ExtensionError('PRF output missing', 'PRF_OUTPUT_MISSING');
    }

    return new Uint8Array(results.prf.results.first);
  } catch (err) {
    // Silent mediation may throw NotAllowedError if user interaction needed
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new ExtensionError('Silent auth failed', 'SILENT_AUTH_FAILED');
    }
    throw err;
  }
}
```

## Deriving a Noise Keypair via HKDF

```typescript
// lib/crypto/deriveKeypair.ts
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { x25519 } from '@noble/curves/ed25519';

export function deriveNoiseKeypair(prfOutput: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  // HKDF-SHA256(prfOutput, salt='smartid2-noise-v1', info='x25519-keypair')
  const okm = hkdf(sha256, prfOutput, new TextEncoder().encode('smartid2-noise-v1'), new TextEncoder().encode('x25519-keypair'), 64);

  // Clamp scalar for X25519 per RFC 7748
  const secretKey = okm.slice(0, 32);
  secretKey[0] &= 248;
  secretKey[31] &= 127;
  secretKey[31] |= 64;

  const publicKey = x25519.getPublicKey(secretKey);
  return { publicKey, secretKey };
}
```

## Session Recovery Flow

```typescript
// entrypoints/background/session.ts
export async function recoverSession(): Promise<Session | null> {
  const { credentialId } = await chrome.storage.local.get('credentialId');
  if (!credentialId) return null;

  try {
    const prfOutput = await assertPRFSilent(new Uint8Array(credentialId));
    const keypair = deriveNoiseKeypair(prfOutput);

    // Store in RAM-only session storage
    await chrome.storage.session.set({
      publicKey: Array.from(keypair.publicKey),
      secretKey: Array.from(keypair.secretKey),
    });

    // Resume WebRTC via offscreen document
    await createOffscreenDocument();
    await sendToOffscreen('RESUME_PEER', { publicKey: keypair.publicKey });

    return { state: 'recovered', keypair };
  } catch (err) {
    if (err instanceof ExtensionError && err.code === 'SILENT_AUTH_FAILED') {
      // Fallback: show auth page
      await chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
    }
    return null;
  }
}
```

## Fallback When PRF is Unavailable

Some platforms (older iOS, certain enterprise Windows configs) do not support PRF. SmartID2 degrades gracefully:

```typescript
export async function createOrGetCredential(): Promise<{ credentialId: Uint8Array; usesPRF: boolean }> {
  try {
    const credential = await createCredentialWithPRF();
    return { credentialId: new Uint8Array(credential.rawId), usesPRF: true };
  } catch (err) {
    if (err instanceof ExtensionError && err.code === 'PRF_NOT_SUPPORTED') {
      // Fallback: create standard WebAuthn credential + encrypted localStorage
      const credential = await createStandardCredential();
      const keypair = x25519.utils.randomPrivateKey();
      // Encrypt keypair with a password-derived key (user must enter PIN once per session)
      await chrome.storage.local.set({
        credentialId: Array.from(credential.rawId),
        encryptedKeypair: await encryptWithPassword(keypair),
        usesPRF: false,
      });
      return { credentialId: new Uint8Array(credential.rawId), usesPRF: false };
    }
    throw err;
  }
}
```

**Security note**: The fallback stores encrypted key material in `chrome.storage.local` (SSD). This violates the "zero persistent crypto on SSD" principle but is necessary for compatibility. The encrypted blob uses Argon2id + AES-256-GCM with a user PIN.

## Testing PRF in Vitest

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('PRF derivation', () => {
  it('derives deterministic keypair from PRF output', () => {
    const prfOutput = new Uint8Array(32).fill(0xab);
    const kp1 = deriveNoiseKeypair(prfOutput);
    const kp2 = deriveNoiseKeypair(prfOutput);
    expect(kp1.publicKey).toEqual(kp2.publicKey);
    expect(kp1.secretKey).toEqual(kp2.secretKey);
  });
});
```

## References

- [WebAuthn PRF Extension Spec](https://w3c.github.io/webauthn/#prf-extension)
- `lib/crypto/` in this repo
- `entrypoints/auth/`
- `AGENTS.md` — "Silent re-authentication" section
