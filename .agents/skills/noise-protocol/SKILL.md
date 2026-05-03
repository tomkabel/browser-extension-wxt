---
name: noise-protocol
description: Implement the Noise XX handshake pattern for E2EE signaling and transport, with cipher state management, test vectors, and cross-language interop between TypeScript (salty-crypto) and Java. Covers ephemeral-static key exchange, payload encryption/decryption, split() for transport initiation, and common pitfalls.
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

## TypeScript Implementation (salty-crypto)

### Setup and Handshake Initiation

```typescript
import { createXXHandshake, generateKeyPair } from '~/lib/channel/noise';

// Static keypair loaded from chrome.storage.session (RAM-only)
const staticKeypair = generateKeyPair();

const handshake = createXXHandshake(staticKeypair);
// Initiator = browser extension. For responder, use createResponderXXHandshake().

// Pre-populate remote static key from QR code scan
// (handshakes use createXXHandshake which doesn't require pre-setting)

// -> e (write first handshake message)
const { packet: message1 } = startXXHandshake(new Uint8Array(0), handshake);
// Send message1 via WebRTC data channel or signaling server
```

### Responding to Handshake

```typescript
// On Android (Java) or browser responder side:
import { createResponderXXHandshake } from '~/lib/channel/noise';

const handshake = createResponderXXHandshake(responderKeypair);

// Read initiator's first message
const { payload, finished } = readXXHandshake(message1, handshake);

// <- e, ee, s, es (responder writes its handshake message)
const { packet: message2 } = startXXHandshake(new Uint8Array(0), handshake);
```

### Completing Handshake and Split

```typescript
// Both sides use readXXHandshake / startXXHandshake until finished
const { payload, finished } = readXXHandshake(message2, handshake);
// finished is true after the last handshake message

// Derive transport ciphers
const { session } = createNoiseSession(
  splitXXHandshake(handshake),
  staticKeypair,
  remoteStaticPublicKey,
  'XX'
);
// session.transport.send.encrypt(plaintext) for sending
// session.transport.recv.decrypt(ciphertext) for receiving
// In XX pattern, the responder's send/recv are swapped relative to initiator
```

### Transport Encryption/Decryption

```typescript
// Initiator sending
const plaintext = new TextEncoder().encode('CREDENTIAL_REQUEST:{"domain":"github.com"}');
const ciphertext = encryptMessage(session, plaintext);
dataChannel.send(ciphertext);

// Initiator receiving
const response = await readFromDataChannel();
const decrypted = decryptMessage(session, response);
const json = new TextDecoder().decode(decrypted);
```

**Critical**: Always use an empty `ad` (associated data) for transport messages unless you are binding to a higher-level protocol frame. SmartID2 binds the message type to the Noise payload envelope, not to the AEAD AD.

## Java Implementation

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

1. **Nonce reuse**: Transport nonces increment per message. Never serialize a transport state and restore it at a stale nonce. If the service worker restarts, re-run the full handshake or use a resumption protocol.
2. **Pattern mismatch**: `Noise_XX` is NOT `Noise_IK`. In XX, both static keys are transmitted encrypted inside the handshake. Do not send static keys in plaintext.
3. **Key order after split**: The initiator's `session.transport.send` encrypts, responder's `session.transport.recv` decrypts. If you get garbled plaintext after split, you have swapped the cipher states.
4. **DH clamping**: X25519 scalars must be clamped before scalar multiplication. salty-crypto and libsodium do this internally, but raw wrappers may not.
5. **Empty payload vs no payload**: Starting a handshake with an empty payload still produces a valid message frame. Do not skip the handshake message.
6. **Salty-crypto initialization**: Ensure the salty-crypto WASM module is initialized before calling any Noise functions. Hold a reference to prevent garbage collection.

## Transport State Management

The `splitXXHandshake()` function returns a `TransportState` which manages encryption/decryption internally. Use `encryptMessage()` and `decryptMessage()` helpers from `~/lib/channel/noise`:

```typescript
import { completeXXHandshake, encryptMessage, decryptMessage } from '~/lib/channel/noise';

const transport = await completeXXHandshake(handshake, sendFn, recvFn);
// transport.send.encrypt(plaintext) and transport.recv.decrypt(ciphertext)
// are managed by the session wrapper:
const session = createNoiseSession(transport, localKey, remoteKey, 'XX');
const encrypted = encryptMessage(session, plaintext);
```

## References

- [noiseprotocol.org](https://noiseprotocol.org)
- `lib/channel/` in this repo
- `SMARTID_VAULT_v6.md` — Phase 2 transport requirements
