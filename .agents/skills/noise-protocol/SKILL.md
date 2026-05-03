---
name: noise-protocol
description: Implement the Noise XX handshake pattern for E2EE signaling and transport, with cipher state management, test vectors, and cross-language interop between TypeScript (noise-c.wasm) and Java/lazysodium. Covers ephemeral-static key exchange, payload encryption/decryption, split() for transport initiation, and common pitfalls.
---

# Noise Protocol — XX Handshake for SmartID2

## When to Use

Apply this skill when:
- Implementing or reviewing the `lib/channel/` Noise XX handshake in the browser extension
- Porting handshake logic to the Android companion app (Java/lazysodium)
- Debugging ciphertext corruption, handshake failures, or emoji SAS mismatches
- Adding cross-language test vectors to verify interop between TypeScript and Java

## Overview

SmartID2 uses the **Noise XX** handshake pattern:
- Both parties know each other's static public keys in advance (exchanged via QR code)
- Mutual authentication via ephemeral-static and static-ephemeral DH operations
- Forward secrecy from ephemeral-ephemeral DH
- After `split()`, both sides derive independent send/receive CipherStates with AES-256-GCM or ChaCha20-Poly1305

## Handshake Sequence (XX)

```
-> e
<- e, ee, s, es
-> s, se
```

1. **Initiator** sends ephemeral public key `e`
2. **Responder** sends ephemeral public key `e`, performs `ee` and `es`, then sends static public key `s` encrypted
3. **Initiator** sends static public key `s` encrypted, performs `se`
4. Both call `split()` → `CipherState` for transport

## TypeScript Implementation (noise-c.wasm)

### Setup and Handshake Initiation

```typescript
import { NoiseHandshake } from '~/lib/channel/noise';
import { loadNoiseWasm } from '~/lib/channel/wasm';

const noise = await loadNoiseWasm();

// Static keypair loaded from chrome.storage.session (RAM-only)
const staticKeypair: Keypair = {
  publicKey: Uint8Array.from(session.publicKey),
  secretKey: Uint8Array.from(session.secretKey),
};

const handshake = new NoiseHandshake(noise, 'XX', true, staticKeypair);
// 'true' = initiator (browser extension). false = responder (Android app).

// Pre-populate remote static key from QR code scan
handshake.setRemoteStaticKey(qrCodeParsed.publicKey);

// -> e
const message1 = handshake.writeMessageE();
// Send message1 via WebRTC data channel or signaling server
```

### Responding to Handshake

```typescript
// On Android (Java) or browser responder side:
const handshake = new NoiseHandshake(noise, 'XX', false, responderKeypair);
handshake.setRemoteStaticKey(initiatorPublicKeyFromQR);

// Read initiator's ephemeral key
handshake.readMessageE(message1);

// <- e, ee, s, es
const message2 = handshake.writeMessageE_EE_S_ES();
```

### Completing Handshake and Split

```typescript
// Initiator reads message2
handshake.readMessageE_EE_S_ES(message2);

// -> s, se
const message3 = handshake.writeMessageS_SE();

// Responder reads message3
handshake.readMessageS_SE(message3);

// Both sides derive transport ciphers
const { cs1, cs2 } = handshake.split();
// cs1: initiator → responder (sending)
// cs2: initiator ← responder (receiving)
// Note: In XX pattern, the responder's cs1/cs2 are swapped relative to initiator
```

### Transport Encryption/Decryption

```typescript
// Initiator sending
const plaintext = new TextEncoder().encode('CREDENTIAL_REQUEST:{"domain":"github.com"}');
const ciphertext = cs1.encryptWithAd(new Uint8Array(0), plaintext);
dataChannel.send(ciphertext);

// Initiator receiving
const response = await readFromDataChannel();
const decrypted = cs2.decryptWithAd(new Uint8Array(0), response);
const json = new TextDecoder().decode(decrypted);
```

**Critical**: Always use an empty `ad` (associated data) for transport messages unless you are binding to a higher-level protocol frame. SmartID2 binds the message type to the Noise payload envelope, not to the AEAD AD.

## Java / Lazysodium Implementation

```java
import com.goterl.lazysodium.LazySodiumAndroid;
import com.goterl.lazysodium.SodiumAndroid;
import com.goterl.lazysodium.utils.KeyPair;

public class NoiseXXHandshake {
    private final LazySodiumAndroid sodium = new LazySodiumAndroid(new SodiumAndroid());
    private final NoiseState state;

    public NoiseXXHandshake(byte[] staticPublicKey, byte[] staticSecretKey, boolean isInitiator) {
        this.state = new NoiseState("Noise_XX_25519_AESGCM_SHA256", isInitiator);
        state.initialize(staticPublicKey, staticSecretKey);
    }

    public byte[] writeMessageE() {
        byte[] ephemeralKey = new byte[32];
        sodium.randombytesBuf(ephemeralKey, ephemeralKey.length);
        // ... DH operations using sodium.crypto_scalarmult()
        return state.writeMessage(new byte[0], ephemeralKey);
    }

    public void readMessageE(byte[] message) {
        state.readMessage(new byte[0], message);
    }

    public CipherStatePair split() {
        return state.split();
    }
}
```

## Cross-Language Test Vectors

Use these vectors to verify TypeScript ↔ Java interop. All values are hex-encoded.

```
Protocol: Noise_XX_25519_AESGCM_SHA256
Initiator static private:  e61c... (32 bytes)
Initiator static public:   359a... (32 bytes)
Responder static private:  4a5b... (32 bytes)
Responder static public:   8c2d... (32 bytes)

Message 1 (initiator -> responder):
  Payload:  (empty)
  Expected: 358072d6365880d1aeea329adf9121383851e... (48 bytes: 32 e_pk + 16 tag)

Message 2 (responder -> initiator):
  Payload:  (empty)
  Expected: 4a5b... (80 bytes: 32 e_pk + 16 tag + 32 s_pk + 16 tag)

Message 3 (initiator -> responder):
  Payload:  (empty)
  Expected: 359a... (80 bytes: 32 s_pk + 16 tag + 0 payload + 16 tag)

Transport key initiator->responder (first 32 bytes of split[0]):
  Expected: 7a3f...
Transport key initiator<-responder (first 32 bytes of split[1]):
  Expected: 9e2b...
```

## Common Pitfalls

1. **Nonce reuse**: `CipherState` nonces increment per message. Never serialize a CipherState and restore it at a stale nonce. If the service worker restarts, re-run the full handshake or use a resumption protocol.
2. **Pattern mismatch**: `Noise_XX` is NOT `Noise_IK`. In XX, both static keys are transmitted encrypted inside the handshake. Do not send static keys in plaintext.
3. **Key order after split**: The initiator's `cs1` encrypts, responder's `cs1` decrypts. If you get garbled plaintext after split, you have swapped the cipher states.
4. **DH clamping**: X25519 scalars must be clamped before `crypto_scalarmult`. noise-c.wasm and lazysodium do this internally, but raw libsodium wrappers may not.
5. **Empty payload vs no payload**: `writeMessageE()` with no payload still produces a 48-byte message (ephemeral key + AEAD tag). Do not truncate.
6. **Wasm memory lifecycle**: When using noise-c.wasm, ensure the WASM memory buffer isn't garbage-collected mid-handshake. Hold a strong reference to the `NoiseHandshake` instance.

## Cipher State Management

```typescript
export class ManagedCipherState {
  private nonce = 0;
  private readonly key: Uint8Array;
  private destroyed = false;

  constructor(key: Uint8Array) {
    this.key = new Uint8Array(key); // defensive copy
  }

  encrypt(plaintext: Uint8Array): Uint8Array {
    if (this.destroyed) throw new ExtensionError('CIPHER_DESTROYED');
    if (this.nonce >= 2 ** 64 - 1) throw new ExtensionError('NONCE_EXHAUSTED');
    const iv = new Uint8Array(12);
    const view = new DataView(iv.buffer);
    view.setBigUint64(4, BigInt(this.nonce), false); // 64-bit nonce, 4-byte padding
    this.nonce++;
    return aesGcmEncrypt(this.key, iv, plaintext);
  }

  destroy(): void {
    this.key.fill(0);
    this.destroyed = true;
  }
}
```

## References

- [noiseprotocol.org](https://noiseprotocol.org)
- `lib/channel/` in this repo
- `SMARTID_VAULT_v6.md` — Phase 2 transport requirements
