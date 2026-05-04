## Context

WebRTC-based transport is the primary communication channel between the browser extension and the Android vault. Currently it has three fragile dependencies: a cloud signaling server for SDP exchange, a TURN credentials HTTP endpoint, and a 2-second USB polling loop that drains battery.

The resilient transport redesign eliminates all three:

1. QR-embedded SDP eliminates the signaling server from the pairing critical path
2. Static TURN credentials eliminate the `/turn-credentials` HTTP dependency
3. Event-driven USB detection eliminates polling (replaced by native host push)

### Connection Architecture (After)

```
Pairing:
  Extension → generates SDP offer → compresses → encodes in QR → phone scans
  Phone → decompresses SDP → creates answer → establishes WebRTC directly
  [Signaling server NOT needed for pairing]

  Fallback: if QR SDP fails (ICE timeout after 15s) → use signaling server

TURN:
  Primary: fetch ephemeral credentials from signaling server (existing)
  Fallback: use static embedded credentials (always available)

USB Detection:
  Go native host detects hotplug → sends "device-attached" via native messaging
  Extension receives push → switches to USB transport
  [No polling]

Idle Detection (WebRTC only):
  chrome.idle.onStateChanged → if user active, phone likely in range → start WebRTC connect
```

## Goals / Non-Goals

**Goals:**
- Eliminate signaling server from pairing critical path (QR-embedded SDP)
- Eliminate /turn-credentials HTTP dependency (static TURN fallback)
- Eliminate USB polling (event-driven native host push)
- Maintain backward compatibility (signaling server still available as fallback)
- Support WebRTC Perfect Negotiation (polite/impolite role)

**Non-Goals:**
- Remove signaling server entirely (still needed for late-joining peers, TURN refresh)
- Remove TURN credentials endpoint (static credentials are fallback only)
- Replace Go native host (event-driven push is additive)

## Decisions

### Decision 1: QR-Embedded SDP

The extension generates a WebRTC offer, compresses it, and embeds in the QR:

```typescript
// Extension side (offscreen document)
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
const compressed = await compressStream(
  JSON.stringify({ sdp: offer.sdp, type: offer.type, ice: turnCredentials })
);
const pairingUrl = `smartid2-pair://${sasCode}?sdp=${encodeURIComponent(compressed)}`;

// Phone side (Android)
const qrData = decodeQR(url);
const decompressed = await decompressStream(qrData.sdp);
const offer = new RTCSessionDescription(JSON.parse(decompressed));
await pc.setRemoteDescription(offer);
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);
// Send answer back via data channel (already open after ICE)
```

Both sides implement WebRTC Perfect Negotiation roles:
- Extension is the **polite peer** (rolls back on conflict)
- Phone is the **impolite peer** (always pushes its latest state)

### Decision 2: Static TURN Credential Fallback

Generate a static TURN credential with long TTL and embed in the extension:

```typescript
const STATIC_TURN_FALLBACK = {
  urls: ['turns:smartid2-turn.fly.dev:443'],
  username: 'static-v1',
  credential: process.env.STATIC_TURN_CREDENTIAL,
};
```

Rotation strategy:
- Credential generated with 45-day TTL
- New credential embedded in each extension build (auto-updated via Chrome Web Store)
- 15-day overlap window ensures no gap during update lag
- Old credential remains valid until its TTL expires (no immediate invalidation)

### Decision 3: Event-Driven USB Detection

The Go native host (apps/native-host/) already has hotplug monitoring in `aoa/hotplug.go`:

```go
func monitorHotplug(ctx *gousb.Context) {
  events := ctx.WatchDeviceChanges()
  for event := range events {
    if event.Type == gousb.DeviceAdded && isAoaCapable(event.Desc) {
      sendNativeMessage(Msg{Type: "device-attached", Vendor: event.Desc.Vendor})
    }
    if event.Type == gousb.DeviceRemoved {
      sendNativeMessage(Msg{Type: "device-removed"})
    }
  }
}
```

The extension listens for these messages:

```typescript
// In TransportManager
async startEventDrivenUsbDetection(): Promise<void> {
  this.usbPort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  this.usbPort.onMessage.addListener((msg) => {
    if (msg.type === 'device-attached') {
      this.handleUsbAttached();
    } else if (msg.type === 'device-removed') {
      this.handleUsbRemoved();
    }
  });
}
```

For environments without the native host (WebRTC-only), use `chrome.idle.onStateChanged` as a heuristic proxy:

```typescript
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === 'active') {
    // User is at the computer — phone is likely in range
    this.attemptWebRtcConnection();
  }
});
```

### Decision 4: Hybrid ICE — SDP Candidates + Trickle + Waterfall

The QR-embedded SDP contains full ICE candidates from the extension. The phone adds its own candidates via trickle ICE over the data channel (already open after SDP exchange). The ICE waterfall tries three phases:
1. Phase 1 (0-3s): Local candidates only (mDNS, host)
2. Phase 2 (3-10s): TURN/UDP relay
3. Phase 3 (10-15s): TURN/TCP 443 relay

If all phases fail after 15s, fall back to signaling server SDP exchange.

## Risks / Trade-offs

- [Risk] QR code size limit — SDP offers can be 5-10KB. QR codes at version 40 can hold ~4KB (binary mode). Use compression (pako/deflate) which typically reduces SDP by 60-70%. If still too large, encode only the SDP `type` + `sdp` fields (omit ICE candidates, which can be trickled after connection).
- [Risk] WebRTC Perfect Negotiation complexity — Both sides must implement the polite/impolite rollback logic correctly. A bug causes infinite negotiation loops. Mitigation: use a simple flag (`isPolite`) and test with deliberate SDP conflicts.
- [Risk] Static TURN credential is less secure — 45-day credential reduces the window but doesn't eliminate it. Mitigation: only used as fallback; primary path still uses ephemeral credentials. Rotate on every build.
- [Risk] Native host may not be installed (WebRTC-only environments) — Event-driven USB is optional; polling is disabled only when native host push is available. Fallback to `chrome.idle` heuristic if no native host.
- [Trade-off] QR-embedded SDP increases QR scan time — SDP compression/decompression adds ~100ms. The benefit (no server round-trip, offline pairing) outweighs this.
