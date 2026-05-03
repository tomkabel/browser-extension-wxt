# Secure Communication Channel: Chrome Extension ↔ Android (OnePlus)

**Scenario:** Establish a secure communication channel from a laptop Chrome browser extension to an Android OnePlus phone. Both devices are in the same room, using the same WiFi to access the internet, and can connect/pair via Bluetooth.

**Threat model:** Same-room WiFi attacker, Bluetooth proximity attacks, active MITM on local network.

---

## 1. QR Code Bootstrapped Noise Protocol (over WebSocket on local WiFi)

**How it works:** One device generates an ephemeral Noise protocol keypair, encodes its public key + a channel binding nonce into a QR code. The other device scans the QR code. They perform a Noise handshake (e.g., `Noise_IK` or `Noise_XX`) over a local WiFi WebSocket. The visual channel is the trust anchor — an attacker must physically see both screens simultaneously to MITM.

**Security properties:**
- Out-of-band authentication via visual channel (extremely hard to spoof remotely)
- Perfect forward secrecy (Noise handshake uses ephemeral keys)
- Mutual authentication
- Strong AEAD cipher (ChaCha20-Poly1305 or AES-256-GCM)
- Resistant to all passive WiFi eavesdropping and active MITM unless attacker has physical line-of-sight to both screens

**Implementation:** Chrome popup renders QR to `<canvas>` → Android scans with CameraX/ZBar → Noise Protocol over `WebSocket` (extension) ↔ NanoHTTPD WebSocket (Android). Simple libraries: `noise-protocol`, `@chainsafe/noise`.

**Verdict:** Gold standard for this scenario. The visual channel provides the strongest possible authentication without pre-shared secrets or a PKI.

---

## 2. OPAQUE (Asymmetric PAKE) over WebSocket

**How it works:** OPAQUE is an augmented PAKE — the "server" stores a password-verifier (not the password itself). User types the same short PIN on both sides. The protocol cryptographically ensures that even an active MITM who sees all messages cannot brute-force the PIN offline, and the server's verifier database yields nothing if stolen.

**Security properties:**
- Mutual authentication from a weak shared secret (4-6 digit PIN)
- Strong forward secrecy via the embedded AKE
- Salted password verifier (asymmetric — server compromise doesn't expose PIN)
- No visual channel or QR needed — pure cryptographic bootstrap from a human-typed PIN

**Implementation:** Both sides run OPAQUE over WebSocket. Libraries: `@hcengineering/opaque` or your own Noise-based OPAQUE.

**Verdict:** Cryptographically near-equivalent to #1 but relies on user-entered PIN. The PIN is strong enough because OPAQUE resists offline dictionary attacks — an active attacker gets exactly 1 guess per protocol run, and each run is trivial to rate-limit.

---

## 3. BLE Secure Connections (LE SC) + Application-Layer Noise/Signal

**How it works:** Pair the devices using BLE with Passkey Entry (6-digit numeric comparison). The BLE link layer uses ECDH (P-256) with AES-CCM encryption and FIPS-approved key derivation. On top of BLE's link-layer encryption, run a Noise or Signal session for defense in depth — if BLE's encryption is ever broken (e.g., pairing downgrade attack), the app-layer encryption saves you.

**Security properties:**
- LE SC Passkey pairing provides authenticated ECDH at the link layer
- Passkey prevents passive eavesdropping and active MITM (1 in 1,000,000 chance for 6-digit passkey)
- Application-layer encryption provides defense in depth
- No WiFi needed — works purely over Bluetooth
- FIPS 140-2 compliant at the transport layer

**Drawback:** BLE throughput is ~100 KB/s best case, ~10 KB/s typical with GATT notifications. Fine for control messages and small payloads; unacceptable for file transfer or streaming.

**Implementation:** Chrome side uses `chrome.bluetoothLowEnergy` API. Android side uses `BluetoothGattServer`. Set BLE peripheral on phone, central on extension.

**Verdict:** Best option if you need security without WiFi dependency and bandwidth isn't a concern.

---

## 4. WebRTC P2P (Direct, Same Network) + Manual DTLS Fingerprint Verification

**How it works:** WebRTC is mandatory-encrypted (DTLS-SRTP for media, DTLS for data channels). On the same WiFi, ICE finds a direct host candidate (no TURN relay). You display the DTLS certificate fingerprint (SHA-256) on both devices and the user visually verifies they match. This prevents MITM from the signaling server.

**Security properties:**
- DTLS 1.2 mandatory, AES-GCM or ChaCha20-Poly1305
- Direct P2P (no cloud relay if same subnet) — no metadata leakage to third party
- Perfect forward secrecy (DTLS uses ephemeral ECDHE)
- Fingerprint verification provides mutual authentication

**Drawback:** The weakest link is the human verification step. Fingerprints are long hex strings; users skip comparison. Mitigation: show both fingerprints and play a "match / don't match" tone, or use a SAS (Short Authentication String) derived from the DTLS handshake and displayed as a 4-word phrase.

**Implementation:** Use a simple local signaling server (or even just paste SDP over a text field). Chrome: native `RTCPeerConnection`. Android: Google's WebRTC library or `PeerConnection` from `libjingle`.

**Verdict:** Extremely strong transport security bogged down by a weak UX for authentication. If you implement SAS properly, this approaches #1 in security.

---

## 5. Local HTTPS WebSocket + Certificate Pinning (bootstrap via QR)

**How it works:** Android runs a local HTTPS server (self-signed cert). The cert's SHA-256 fingerprint is encoded in a QR code shown in the Chrome popup. The extension scans or accepts the QR, then connects to `wss://<phone-ip>:<port>` with certificate pinning against the known fingerprint. Mutual TLS is also possible.

**Security properties:**
- TLS 1.3 provides PFS, AEAD encryption, and integrity
- Certificate pinning prevents MITM — an attacker on the WiFi cannot substitute their certificate
- QR code provides out-of-band authentication of the server

**Drawback:** TLS has a larger attack surface than Noise (X.509 parsing, extension handling, more CVE history). Android's local server TLS libraries are heavier and more complex. One-way authentication only (server is authenticated; client is not unless you add mTLS).

**Implementation:** Android: `NanoHTTPD` with SSLContext + BKS keystore. Extension: `fetch` or `WebSocket` with pinned cert fingerprint comparison in `onBeforeRequest` or manual cert check.

**Verdict:** Practical and secure, but strictly inferior to Noise (#1) for this use case — Noise has a smaller code footprint, fewer historical vulnerabilities, and built-in mutual authentication.

---

## 6. WiFi Direct + Noise or TLS Channel

**How it works:** Android creates a WiFi Direct group (soft AP). Laptop connects to it. Run an encrypted channel over this dedicated ad-hoc network. No router involved — air-gapped from the home/office WiFi.

**Security properties:**
- No exposure to the shared WiFi network at all
- Physical proximity required to connect (WiFi Direct range)
- Noise/TLS provides encryption on top
- Even if the WiFi Direct link is unencrypted (it uses WPA2 by default), the app-layer encryption protects data

**Drawback:** Chrome extension has no direct WiFi Direct API. The laptop must system-level join the WiFi Direct network, which requires user interaction outside the extension and may disrupt internet connectivity. Awkward UX.

**Verdict:** Network-level isolation is appealing, but the implementation friction from a Chrome extension makes this impractical without a companion native app.

---

## 7. Cloud Relay (FCM / WebSocket Server) with Signal Protocol

**How it works:** Both devices connect to a cloud relay server (Firebase Cloud Messaging for Android push; WebSocket to the server from Chrome extension). All messages are encrypted end-to-end with the Signal Protocol (Double Ratchet). The relay server sees ciphertext only.

**Security properties:**
- Strong E2E encryption (Signal Protocol is battle-tested)
- PFS via Double Ratchet, post-compromise security
- Works even if devices are not on the same network
- The relay server sees metadata (who talks to whom, timestamps, message sizes)

**Drawback:** Requires internet connectivity and trust in the relay server's availability. Google/Firebase sees communication patterns. Key exchange must be authenticated — you still need one of the above methods (QR, PIN) to bootstrap the initial shared secret.

**Implementation:** Use `libsignal-protocol-typescript` (extension) and `libsignal-client` (Android/Java). Relay via Firebase Cloud Messaging.

**Verdict:** Excellent crypto but unnecessary indirection when devices are on the same LAN. Use Signal Protocol's encryption but run it over a local WebSocket (#1 or #2) — don't route through the cloud unless you need remote communication.

---

## 8. Plain TLS WebSocket on Local Network (Self-Signed, No Pinning)

**What's missing:** No certificate pinning, no out-of-band verification. The connection is encrypted against passive eavesdroppers but trivially MITM'd by an active attacker on the same WiFi who can present their own self-signed certificate and proxy traffic. The browser/extension will show a warning that is easily ignored.

**Verdict:** Protects against casual passive sniffing. Zero protection against an active attacker. Not suitable for any data you actually care about.

---

## 9. Plain WebSocket / HTTP over Local Network

No encryption. Anyone on the WiFi reads everything in cleartext. Only appropriate for non-sensitive debug data in a trusted home network.

---

## Pragmatic Recommendation

For a Chrome extension ↔ Android phone companion app, the **practical top three** are:

| Rank | Approach | UX | Crypto Strength | Implementation Complexity |
|------|----------|----|-----------------|---------------------------|
| 1 | QR + Noise over WebSocket | Medium (scan QR once) | Maximum | Medium |
| 2 | OPAQUE over WebSocket | Best (type a PIN) | Maximum | High (fewer libraries) |
| 3 | BLE Passkey + App-Layer Noise | Good (standard pairing) | Strong | Low-Medium |

**My pick:** **QR + Noise over WebSocket** for the initial pairing, then cache the Noise static keypair and re-establish sessions without QR on subsequent connections. You get the strongest possible authentication at the cost of one QR scan, then seamless reconnection forever.
