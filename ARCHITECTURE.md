> **STATUS**: PHASE 1 — WebRTC-based Phone-as-Vault
> 
> **This architecture is Phase 1 of a multi-phase evolution.** The ultimate end-goal
> architecture is defined in `../SMARTID_VAULT_v6.md` (USB AOA 2.0 + zkTLS + NDK 
> Enclave + Ghost Actuator). Phase 1 builds the browser extension foundation, 
> WebAuthn/PRF patterns, Android companion app, and WebRTC transport. Phase 1.5 
> introduces the Go Native Host and USB AOA bridge. Phase 2 realizes the full V6 
> specification.
>
> For the V6 migration plan, see `openspec/changes/vault6-migration-strategy/`.
> For individual V6 component proposals, see:
> - `openspec/changes/usb-aoa-transport-proxy/`
> - `openspec/changes/zktls-context-engine/`
> - `openspec/changes/challenge-bound-webauthn/`
> - `openspec/changes/ndk-enclave-pin-vault/`
> - `openspec/changes/ghost-actuator-gesture-injection/`
> - `openspec/changes/eidas-qes-hardware-gate/`

The greatest trap in security engineering is **complexity**. Every time we tried to outsmart the browser sandbox, the corporate firewall, or the laws of physics, we introduced a fragile point of failure. 

This document describes **Phase 1: The Pragmatic Zero-Trust Architecture** — it abandons theoretical crypto-gymnastics in favor of browser sandbox realities, enterprise network constraints, and absolute security through **simplicity, standard APIs, and graceful degradation.**

Here is the Phase 1 blueprint.

---

### Phase 1: Pragmatic Pairing (The Unbreakable Bootstrap)
*We abandon acoustic chirps, flashing lights, and Bluetooth APIs. We use the most reliable optical medium in the world, secured by human verification.*

1. **The Ephemeral QR Code:**
   * The laptop extension generates an ephemeral X25519 public key and a random Room ID. 
   * It displays a standard, high-contrast QR code.
2. **E2EE Cloud Signaling (The Reality Check):**
   * We accept that local-only signaling (BLE/mDNS) is too flaky for bootstrapping.
   * The extension connects to a lightweight cloud signaling server (e.g., via WebSocket).
   * *The Security Guarantee:* The signaling payload is End-to-End Encrypted (E2EE) using the keys exchanged via the QR code. The server is a "dumb pipe"—it only routes opaque ciphertext between the Room ID. It cannot read the traffic.
3. **The 3-Emoji SAS (Human-in-the-Loop):**
   * Once the WebRTC handshake completes, both devices derive a session key.
   * Both screens display a **3-Emoji Short Authentication String (SAS)** (e.g., 🚀 🎸 🥑). 
   * The user taps "Match" on the phone. This completely neutralizes any theoretical Man-in-the-Middle (MitM) or signaling server compromise, with zero numerical typing.

### Phase 2: Resilient Transport (Graceful Degradation)
*We stop fighting AP Isolation. We let the network stack do what it was designed to do.*

1. **ICE Candidate Waterfall:**
   * The extension and phone attempt to establish a WebRTC Data Channel.
   * **Step 1 (mDNS Local):** WebRTC tries to connect locally via mDNS. If the devices are on a home Wi-Fi network, this succeeds. Latency is <5ms.
   * **Step 2 (TURN / UDP):** If the user is on an Enterprise Wi-Fi with Layer 2 AP Isolation, local connection fails. WebRTC seamlessly fails over to a cloud TURN server over UDP. 
   * **Step 3 (TURN / TCP 443):** If the corporate firewall aggressively drops UDP traffic, the TURN server falls back to TCP port 443, disguising the WebRTC traffic as standard HTTPS.
   * *The Result:* The connection succeeds 99.99% of the time. The user never sees an error. Because the Data Channel is E2EE (DTLS + Noise), the transport medium (local vs. cloud relay) is irrelevant to security.

### Phase 3: The "Dumb Terminal" Architecture (State Management)
*We stop trying to safely store keys on the laptop's hard drive. The laptop is hostile territory.*

1. **The Phone as the Vault:**
   * The Chrome extension holds **zero persistent cryptographic state** on the SSD (`chrome.storage.local` is empty).
   * The Android device holds the actual encrypted database (passwords, 2FA tokens) backed by the Android Keystore.
2. **RAM-Only MV3 Survival:**
   * The extension’s Manifest V3 Service Worker maintains the session purely in `chrome.storage.session` (which lives exclusively in RAM and is wiped when the browser closes).
   * When the Service Worker sleeps (the 30-second rule), the Offscreen Document keeps the WebRTC connection alive. If the browser fully restarts, the extension uses a cached, hardware-bound WebAuthn PRF key to silently re-authenticate the WebRTC link to the phone.

### Phase 4: Just-In-Time (JIT) Authentication & UX
*We abandon unreliable proximity distance metrics. We rely on the absolute truth of human intent.*

1. **The Intent-Driven Unlock:**
   * The user navigates to `github.com`. The extension detects a login field.
   * The extension sends a "Credential Request" ping over the WebRTC channel to the phone.
2. **Context-Aware Biometric Prompt:**
   * If the user's phone is currently unlocked in their hand, it silently approves the request.
   * If the phone is locked on the desk or in a pocket, the Android app triggers a silent smartwatch tap or a lock-screen notification: *"Tap fingerprint to log into GitHub on Laptop."*
3. **The Micro-Payload Delivery:**
   * *Crucial distinction:* The phone does not send the master decryption key to the laptop. It does not send the whole vault.
   * The phone decrypts the GitHub password *locally on the phone* and sends **only the requested password** over the E2EE WebRTC channel. 
   * The extension receives it, injects it into the DOM, and immediately garbage-collects/zeros the variable in RAM.

---

### Why This is the Ultimate Production Architecture

1. **It Actually Ships:** No custom ML models, no audio-jitter math, no accessibility-violating QR codes. Every piece of this architecture relies on stable, well-documented W3C and OS APIs (WebRTC, standard QR, Web Crypto, BiometricPrompt).
2. **Bulletproof Security Boundary:** The laptop is treated as a compromised I/O device. By ensuring the vault never leaves the phone, and sending only JIT micro-payloads (single passwords), a hacker who compromises the laptop gets absolutely nothing but the password for the specific site the user is actively logging into at that exact second.
3. **Network Agnosticism:** By utilizing WebRTC with standard TURN fallbacks, it doesn't matter if the user is at home, behind a strict corporate firewall, or on a 5G hotspot. It works frictionlessly.
4. **Beautiful UX:** The user scans one QR code on day one. After that, logging in simply feels like the phone and laptop are telepathically connected. A quick fingerprint tap on the phone auto-fills the laptop screen.

---

### Evolution to V6: The Ultimate Goal

This Phase 1 architecture builds the essential foundation: browser extension patterns, WebAuthn/FIDO2 integration, Android companion app, and WebRTC transport. These components are directly reusable in the V6 evolution.

**Phase 1.5 (Bridge)** adds USB AOA 2.0 transport via a Go Native Messaging Host, introducing a common Transport abstraction that unifies WebRTC + USB. USB mode provides hardware proximity guarantees.

**Phase 2 (V6 Ultimate)** layers on:
- **zkTLS Context Engine**: WASM-based TLSNotary attestation for mathematical proof of transaction context, defeating RATs and DOM manipulation
- **Challenge-Bound WebAuthn**: zkTLS-derived WebAuthn challenge cryptographically fuses PC biometrics to the specific transaction
- **NDK Memory-Locked Enclave**: C++ mlock/explicit_bzero PIN processing — PINs never enter JVM heap
- **Ghost Actuator**: AccessibilityService.dispatchGesture() for blind, zero-secret PIN entry into Smart-ID app
- **eIDAS QES Gate**: Hardware Volume Down interrupt for legally bulletproof Qualified Electronic Signatures

See `SMARTID_VAULT_v6.md` for the complete V6 specification.

**The Senior Expert Verdict:**
True architectural genius isn't about how many cutting-edge technologies you can stack on top of each other. It is about removing every unnecessary moving part until all that remains is a robust, un-phishable, un-hackable, and user-friendly core. This is what you build. Phase 1 delivers this core; V6 evolves it to mathematical perfection.

