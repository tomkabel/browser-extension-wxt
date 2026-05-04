## Context

The signaling server coordinates WebRTC peer discovery for the SmartID2 pairing flow. In production, it handles connections from both the browser extension (offscreen document) and the Android companion app. Without access control, any network observer who guesses a 6-digit SAS code can join a pairing room and observe SDP exchanges (though they cannot decrypt the Noise-encrypted data channel).

The three-layer enhancement adds:

1. **Commitment-based room access**: Prevents SAS guessing attacks by binding room access to the QR code content.
2. **Protocol version + capability negotiation**: Ensures forward compatibility as the protocol evolves (new features, new transport types).
3. **Prometheus metrics**: Production observability for incident response and capacity planning.

## Goals / Non-Goals

**Goals:**
- Prevent unauthorized room joins via cryptographic commitment bound to QR code
- Negotiate protocol version and capabilities between extension and Android app
- Expose production metrics for signaling server health and performance
- Structured JSON logging for log aggregation
- Backward compatible QR encoding (older phone apps can still parse)

**Non-Goals:**
- End-to-end encryption of SDP exchanges (Noise handles data channel encryption; SDP is inherently public)
- Authentication of individual users (pairing is device-to-device, not user-to-service)
- Rate limiting of room creation (covered by existing TTL-based room cleanup)

## Decisions

### Decision 1: Commitment Generation

The extension generates a 32-byte CSPRNG nonce and computes:

```
commitment = SHA-256(extensionStaticKey || nonce || sasCode)
```

The nonce ensures that even if the same extension pairs with the same phone again, the commitment is different. The extension static key prevents a phone from computing the commitment without knowing the extension's public key — only the phone that scanned the QR (which contains the nonce and SAS code) can compute the correct commitment.

### Decision 2: Protocol Version & Capability Negotiation

The Noise handshake currently sends empty payload bytes in message 1. This is replaced with a canonical JSON-encoded capability object:

```typescript
const capabilities = {
  protocolVersion: 1,
  features: ['prf', 'challenge-bound-v1', 'credential-provision'],
  supportedTransports: ['webrtc', 'usb'],
};
// Encoded as length-prefixed payload in handshake message 1
const { packet: msg1 } = handshake.writeMessage(encodeCapabilities(capabilities));
```

The responder (phone) decodes this, compares against its own capabilities, and responds with its capability set in message 2. After the handshake completes, both sides compute:

```
negotiatedFeatures = myFeatures ∩ theirFeatures
negotiatedTransports = myTransports ∩ theirTransports
```

This is stored in the Noise session for feature-gating subsequent commands.

### Decision 3: Prometheus Metrics Endpoint

Add a `/metrics` endpoint to the HTTP server using `prom-client`:

```javascript
const promClient = require('prom-client');
const connectionsCounter = new promClient.Counter({
  name: 'signaling_connections_total',
  help: 'Total WebSocket connections established',
});
const pairingDuration = new promClient.Histogram({
  name: 'signaling_pairing_duration_seconds',
  help: 'Duration from room creation to paired',
  buckets: [1, 3, 5, 10, 30],
});
const iceFailures = new promClient.Counter({
  name: 'signaling_ice_failures_total',
  help: 'ICE candidate failures across all rooms',
});

httpServer.on('request', (req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': promClient.register.contentType });
    res.end(promClient.register.metrics());
    return;
  }
});
```

### Decision 4: Structured Logging

Replace `console.log` with structured JSON:

```javascript
function log(level, message, data = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId: data.requestId || crypto.randomUUID(),
    ...data,
  }));
}
```

### Decision 5: Backward Compatibility

The QR code URL format is extended but older phone apps remain parseable:

```
Current: smartid2-pair://<sas-code>
New:     smartid2-pair://<sas-code>?nonce=<base64url>&commitment=<base64url>&sdp=<compressed>
```

The `nonce` and `commitment` query parameters are optional in the QR parser. The server, however, REQUIRES commitment for room joins. An older phone app without commitment will be rejected by the server.

## Risks / Trade-offs

- [Risk] Commitment scheme is only as secure as the QR code display — If an attacker can display a fake QR to the phone (e.g., compromised monitor), they control the commitment. Mitigated by emoji SAS: user must confirm 3-4 emoji match before pairing completes.
- [Risk] Protocol version mismatch between extension and Android — The negotiation ensures graceful fallback. If no intersection exists, pairing fails with a clear error message asking the user to update one of the apps.
- [Risk] Prometheus endpoint is unauthenticated — Deploy behind Fly.io private networking or add simple API key authentication. The metrics data is low-sensitivity (connection counts, not user data).
- [Risk] Large capability payload in handshake — Capability JSON is typically <200 bytes. Noise protocol handles payloads up to 65535 bytes with ease.
