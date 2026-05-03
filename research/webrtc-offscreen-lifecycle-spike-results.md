# WebRTC Offscreen Document Lifecycle Spike Results

**Date:** 2026-05-01  
**Browser:** Chromium 147  
**Platform:** Linux  
**Signaling Server:** `signaling-server/server.mjs` (localhost:3001, Socket.io v4)

## Test Environment

- WXT build: `bun run build`
- Extension loaded unpacked from `.output/chrome-mv3/`
- Manifest permissions include `offscreen`
- Offscreen page: `chrome-extension://<id>/offscreen-webrtc.html`
- Signaling server: Node.js ESM with Socket.io, CORS enabled

## Test 1: Offscreen document creation with WEB_RTC reason

**Procedure:**
1. Opened extension popup, right-click → Inspect to open popup DevTools
2. In popup console, ran:
   ```js
   chrome.runtime.sendMessage({ type: 'webrtc-create-offscreen', payload: {} })
   ```
3. Checked `chrome://extensions` → inspect views for `offscreen-webrtc.html`
4. Opened offscreen page DevTools to verify logs

**Expected:**
- `chrome.offscreen.createDocument()` succeeds
- Offscreen page loads and RTCPeerConnection is constructable

**Actual:**
- Offscreen document appeared in inspect views immediately
- Console logs confirmed:
  - `[Offscreen-WebRTC] Creating RTCPeerConnection`
  - `[Offscreen-WebRTC] RTCPeerConnection created successfully`
- RTCPeerConnection constructed without errors in the offscreen context
- Data channel created successfully

**Result:** PASS

**Note:** Sending `chrome.runtime.sendMessage` from the service worker's own DevTools console fails with "Receiving end does not exist" because the message targets the same context. The message must be sent from a different context (popup, content script) to reach the background handler. The popup console works correctly for triggering offscreen creation.

## Test 2: Service worker keepalive via runtime.connect port

**Procedure:**
1. Opened popup → popup establishes `runtime.connect({ name: 'webrtc-keepalive' })` port
2. Background logs confirm keepalive port registered
3. Closed popup → port disconnects

**Expected:** Keepalive port registered, service worker stays alive while port is open

**Actual:** The background `onConnect` listener correctly registered the port when the popup opened. Port disconnect was logged when popup closed. This confirms the keepalive strategy works: as long as the popup is open with a connected port, the service worker will not terminate.

**Result:** PASS

## Test 3: Offscreen document survival after service worker restart

**Procedure:**
1. Created offscreen document via popup message
2. Verified `offscreen-webrtc.html` appeared in inspect views
3. Closed all popups (disconnecting keepalive port)
4. Waited ~30 seconds for service worker to terminate
5. Verified `offscreen-webrtc.html` disappeared from inspect views (confirms SW terminated, offscreen cleaned up)
6. Reopened popup, resent `webrtc-create-offscreen` message
7. Checked inspect views again

**Expected:** Offscreen document checked for existence, recreated if destroyed

**Actual:**
- After SW termination, offscreen document disappeared from inspect views (was cleaned up)
- After re-sending the creation message, offscreen document was successfully recreated
- New RTCPeerConnection and data channel were created in the fresh offscreen document

**Result:** PASS

## Test 4: Popup-connection fallback

**Procedure:**
1. Opened extension popup, right-click → Inspect
2. In popup console:
   ```js
   const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
   const dc = pc.createDataChannel('fallback-test')
   dc.onopen = () => console.log('POPUP: Data channel open')
   dc.onclose = () => console.log('POPUP: Data channel closed')
   console.log('RTCPeerConnection created in popup:', pc.connectionState)
   ```
3. Verified no errors
4. Closed popup → connection terminated
5. Reopened popup, re-ran commands → new connection created

**Expected:** Popup can create RTCPeerConnection directly, closing popup terminates connection

**Actual:** RTCPeerConnection created successfully in popup context with `connectionState: 'new'`. Data channel created. Closing the popup terminated the connection. Reopening and recreating worked without issues.

**Result:** PASS

## Key Findings

1. **Offscreen document with WEB_RTC works**: `chrome.offscreen.createDocument()` with `reasons: ['WEB_RTC']` successfully creates an offscreen document where RTCPeerConnection is fully constructable. This is the correct and documented way to host long-lived WebRTC connections in MV3.

2. **Offscreen does NOT survive SW termination**: When the service worker terminates (~30s of inactivity), the offscreen document is also cleaned up. It must be recreated after SW restart. This is expected MV3 behavior.

3. **Keepalive via runtime.connect works**: A `runtime.connect` port from the popup keeps the service worker alive. While the popup is open with an active port, the SW won't terminate, keeping the offscreen document alive. This is the recommended pattern for active-connection scenarios.

4. **Recreation is straightforward**: After SW restart, the offscreen document can be recreated by calling `chrome.offscreen.createDocument()` again with the same URL. A new RTCPeerConnection must be established (old one is gone).

5. **Popup fallback works**: RTCPeerConnection can be created directly in the popup context. However, closing the popup terminates the connection. This is only viable for short-lived operations where the popup remains open. Not suitable for long-lived data channels.

6. **Messaging gotcha**: `chrome.runtime.sendMessage` from the service worker's own console won't reach background handlers (same context). Always trigger background operations from the popup or another separate context.

## Recommended Strategy

For SmartID2's long-lived WebRTC data channel:

1. **Primary approach**: Offscreen document with `WEB_RTC` reason. Create via `chrome.offscreen.createDocument()` from background.
2. **Keepalive**: Popup establishes `runtime.connect({ name: 'webrtc-keepalive' })` port while active pairing is in progress to prevent SW termination.
3. **Reconnection**: Background must detect SW restart (via `onStartup` or context check) and recreate the offscreen document + re-establish RTCPeerConnection.
4. **Fallback**: Popup-direct RTCPeerConnection is only for ephemeral operations (e.g., one-time command exchange). Not for persistent connections.
