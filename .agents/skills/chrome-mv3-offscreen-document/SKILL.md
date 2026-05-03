---
name: chrome-mv3-offscreen-document
description: Chrome MV3 Offscreen Document API lifecycle management for WebRTC data channel survival in service workers. Covers creation/closure patterns, messaging between SW and offscreen, fix-manifest.js workaround for background.type module, keepalive strategies, and DOM API access limitations.
---

# Chrome MV3 Offscreen Document — WebRTC Survival

## When to Use

Apply this skill when:
- The WebRTC connection drops after 30 seconds of service worker inactivity
- `chrome.tabs` or `chrome.runtime.sendMessage` returns "Receiving end does not exist"
- Building or debugging the `entrypoints/offscreen-webrtc/` entrypoint
- Reviewing `fix-manifest.js` post-build manifest patches

## The Problem

Chrome Manifest V3 service workers are **event-driven** and aggressively terminated after ~30 seconds of idleness. WebRTC `RTCPeerConnection` requires:
- A living `window` / `document` context
- `setInterval` / `requestAnimationFrame` for ICE keepalive
- Access to DOM APIs (`RTCPeerConnection`, `RTCDataChannel`)

The **Offscreen Document API** (Chrome 109+) solves this by allowing a hidden, non-interactive HTML page to run alongside the service worker.

## Lifecycle Rules

Chrome enforces strict rules:
1. **Only one offscreen document** may exist at any time per extension
2. It must be created from the **service worker only** (not content scripts or popup)
3. It auto-closes if the service worker restarts unless you re-acquire it
4. Reason must be one of: `AUDIO_PLAYBACK`, `AUDIO_RECORDING`, `CLIPBOARD`, `DOM_PARSER`, `GEOLOCATION`, `LOCAL_STORAGE`, `NETWORK`, `WORKER`, `USER_MEDIA`, `DISPLAY_MEDIA`, `WEB_RTC`

SmartID2 uses reason: **`WEB_RTC`**.

## Creation Pattern

```typescript
// entrypoints/background/offscreenWebrtc.ts
import { defineBackground } from 'wxt/utils/define-background';

const OFFSCREEN_PATH = 'offscreen-webrtc.html';

export async function createOffscreenDocument(): Promise<void> {
  // 1. Check if already exists (Chrome throws if you create a duplicate)
  if (await hasOffscreenDocument()) {
    return;
  }

  // 2. Create with WEB_RTC reason
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.WEB_RTC],
    justification: 'Maintain WebRTC data channel for phone-as-vault transport',
  });
}

async function hasOffscreenDocument(): Promise<boolean> {
  // Check all existing contexts for our offscreen path
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.some((c) => c.documentUrl?.endsWith(OFFSCREEN_PATH) ?? false);
}

export async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}
```

## Messaging: Service Worker ↔ Offscreen

Use `chrome.runtime.sendMessage` with a typed envelope. The offscreen document listens via `chrome.runtime.onMessage`.

```typescript
// Service worker sending ICE config or signaling messages
export async function sendToOffscreen<T>(type: string, payload: T): Promise<void> {
  await chrome.runtime.sendMessage({
    target: 'offscreen',
    type,
    payload,
  });
}

// Offscreen document entrypoint (entrypoints/offscreen-webrtc/main.ts)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  (async () => {
    switch (message.type) {
      case 'CREATE_PEER':
        await peerConnectionManager.create(message.payload.config);
        sendResponse({ success: true });
        break;
      case 'ADD_ICE_CANDIDATE':
        await peerConnectionManager.addIceCandidate(message.payload);
        sendResponse({ success: true });
        break;
      case 'SEND_VIA_CHANNEL':
        peerConnectionManager.send(message.payload);
        sendResponse({ success: true });
        break;
      case 'CLOSE':
        peerConnectionManager.close();
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ success: false, error: 'UNKNOWN_TYPE' });
    }
  })();

  return true; // async sendResponse
});
```

## Keepalive Strategies

Without keepalive, Chrome may still terminate the offscreen document. Implement a **heartbeat/ping** from the offscreen document to the service worker:

```typescript
// Inside offscreen document
setInterval(() => {
  chrome.runtime.sendMessage({ target: 'background', type: 'PING' });
}, 20000); // every 20s

// Service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target === 'background' && msg.type === 'PING') {
    // Reset any SW idle timers; Chrome sees activity
    return false;
  }
});
```

Alternative: keep the `RTCDataChannel` open with periodic NO-OP messages. WebRTC ICE itself sends STUN keepalives, which counts as document activity.

## The `fix-manifest.js` Workaround

WXT adds `"type": "module"` to the `background` section of `manifest.json` for ESM service workers. **Chrome MV3 rejects this field** for service workers (it is valid only for MV3 module scripts in some Edge builds, but Chrome stable errors).

`fix-manifest.js` (run post-build) strips it:

```javascript
// scripts/fix-manifest.js
import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve('.output/chrome-mv3/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// WXT emits "type": "module" which Chrome MV3 service workers reject
if (manifest.background?.type === 'module') {
  delete manifest.background.type;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
```

**Build pipeline**:
```bash
wxt build && node scripts/fix-manifest.js
```

## DOM API Limitations

Offscreen documents are **not visible** and have restricted APIs:

| API | Available? | Notes |
|-----|-----------|-------|
| `RTCPeerConnection` | ✅ Yes | Primary purpose |
| `RTCDataChannel` | ✅ Yes | |
| `WebSocket` | ✅ Yes | Can be used for signaling fallback |
| `window.localStorage` | ✅ Yes | But prefer `chrome.storage` |
| `document.createElement` | ⚠️ Limited | No visible UI; create invisible elements only |
| `alert()` / `confirm()` | ❌ No | Throws |
| `window.open()` | ❌ No | Throws |
| `chrome.tabs` | ❌ No | Not available in offscreen context |
| `chrome.action` | ❌ No | Not available |

## Error Handling

```typescript
// Common errors and resolutions

// "Only one offscreen document may be created"
// → Always check getContexts() before createDocument()

// "Reason 'WEB_RTC' is not supported"
// → Chrome version < 109. Update or polyfill with popup keepalive.

// "Document could not be created"
// → Manifest missing "offscreen" permission or invalid URL path

// Manifest requirement:
// {
//   "permissions": ["offscreen"],
//   "host_permissions": []
// }
```

## Testing with WXT / Vitest

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createOffscreenDocument } from '~/entrypoints/background/offscreenWebrtc';

describe('offscreen lifecycle', () => {
  it('creates document only if absent', async () => {
    const create = vi.spyOn(chrome.offscreen, 'createDocument').mockResolvedValue(undefined);
    vi.spyOn(chrome.runtime, 'getContexts').mockResolvedValue([]);

    await createOffscreenDocument();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: [chrome.offscreen.Reason.WEB_RTC] })
    );
  });
});
```

## References

- [Chrome Offscreen API docs](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- `entrypoints/background/offscreenWebrtc.ts`
- `entrypoints/offscreen-webrtc/`
- `scripts/fix-manifest.js`
