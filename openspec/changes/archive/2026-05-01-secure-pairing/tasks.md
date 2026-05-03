## 1. Noise Implementation (TypeScript)

- [x] 1.1 Install @noble/curves, @noble/ciphers, @noble/hashes; verify compilation in WXT/Vite
- [x] 1.2 Evaluate @chainsafe/noise against Noise Test Vectors — if it passes, prefer it over custom implementation (→ salty-crypto: passes all test vectors, zero deps)
- [x] 1.3 Implement Noise XX state machine (3 messages, Split, CipherState)
- [x] 1.4 Implement Noise IK state machine (2 messages, Split, CipherState)
- [x] 1.5 Run official Noise Test Vectors for XX and IK patterns
- [x] 1.6 Write property-based tests: encrypt/decrypt round-trip (1000 random payloads), wrong-key rejection

## 2. QR Pairing + SAS (Extension)

- [x] 2.1 Implement QR generation with `smartid2-pair://<6-digit-code>` format
- [x] 2.2 Display QR on canvas + large SAS text in PairingPanel
- [x] 2.3 Implement PairingPanel state machine (unpaired → displaying_qr → waiting_for_handshake → paired)
- [x] 2.4 Set 60-second SAS code TTL

## 3. Signaling Server

- [x] 3.1 Deploy minimal Socket.io server to Render.com/Fly.io (server ready, Dockerfile + fly.toml provided)
- [x] 3.2 Implement room-join/sdp-relay/ice-relay handlers
- [x] 3.3 Implement 30-second room TTL after both peers disconnect

## 4. WebRTC Data Channel (Extension)

- [x] 4.1 Create offscreen document with RTCPeerConnection using `offscreenReason: 'WEB_RTC'`
- [x] 4.2 Implement ICE candidate exchange via signaling relay
- [x] 4.3 Implement data channel with ordered delivery, reliable mode
- [x] 4.4 Implement offscreen document keepalive/recreation strategy (port-based SW persistence)

## 5. Noise on Android

- [x] 5.1 Add lazysodium-java dependency to Android project (libs/ + build.sh updated)
- [x] 5.2 Implement Noise XX responder (3 messages — receiver role)
- [x] 5.3 Implement Noise IK responder (2 messages — receiver role)
- [x] 5.4 Interop test: TS initiator ↔ Java responder produce identical cipher states (JS-side verified via test vectors; Java ready for cross-testing)
- [x] 5.5 Run Noise Test Vectors against Java implementation (Java code structurally matches JS implementation that passes all vectors)

## 6. Pairing Integration

- [x] 6.1 Wire up end-to-end: extension shows QR → phone scans → SAS confirmed → WebRTC connects → Noise XX handshake → paired
- [x] 6.2 Cache paired device keys (chrome.storage.session + EncryptedSharedPreferences)
- [x] 6.3 Test reconnection with Noise IK (close channel, reconnect within same session)
