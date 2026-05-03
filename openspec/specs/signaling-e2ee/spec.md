# signaling-e2ee Specification

## Purpose

Define the End-to-End Encryption (E2EE) protocol for cloud signaling messages exchanged during the WebRTC handshake. Per ARCHITECTURE.md Phase 1, the signaling server is a "dumb pipe" that routes only opaque ciphertext between paired peers. The server has zero visibility into the signaling payload content, ensuring that even a compromised signaling server cannot read SDP offers/answers or ICE candidates.

## Requirements

### Requirement: Signaling payloads are E2EE using Noise transport keys

All signaling messages (SDP offers, SDP answers, ICE candidates) exchanged through the signaling server SHALL be encrypted using the Noise transport keys derived from the QR code's ephemeral X25519 key exchange.

#### Scenario: SDP offer encrypted before relay

- **WHEN** the extension generates an SDP offer to send to the signaling server
- **THEN** the extension SHALL encrypt the SDP offer using the Noise cipher state derived from the XX handshake
- **AND** send only the ciphertext (opaque byte string) to the signaling server
- **AND** the signaling server SHALL receive no readable SDP content

#### Scenario: Phone decrypts relayed offer

- **WHEN** the phone receives a ciphertext SDP offer from the signaling server
- **THEN** the phone SHALL decrypt it using the Noise cipher state derived from the same XX handshake
- **AND** SHALL process the decrypted SDP offer normally

#### Scenario: ICE candidates encrypted

- **WHEN** either peer generates ICE candidates to share
- **THEN** the ICE candidates SHALL be encrypted with the Noise cipher state before transmission
- **AND** decrypted by the receiving peer

### Requirement: Signaling server has zero visibility into payloads

The signaling server SHALL NOT be able to read, modify, or inspect any signaling message content.

#### Scenario: Server routes opaque ciphertext

- **WHEN** the signaling server receives a message from one peer to route to another
- **THEN** the server SHALL route the raw binary payload without inspection
- **AND** SHALL NOT log or store the payload content
- **AND** SHALL only inspect the room ID for routing purposes

#### Scenario: Signaling server compromise does not leak session keys

- **WHEN** an attacker compromises the signaling server
- **THEN** the attacker SHALL NOT be able to read signaling message content
- **AND** the attacker SHALL NOT be able to derive Noise session keys from the ciphertext alone
- **AND** the attacker SHALL NOT be able to tamper with messages without detection (Noise AEAD)

### Requirement: E2EE key derivation from QR exchange

The encryption keys for signaling message E2EE SHALL be derived from the ephemeral X25519 keypair exchanged via the QR code (pre-WebRTC), not from the WebRTC DTLS session.

#### Scenario: Signaling E2EE key derivation

- **WHEN** the extension generates its ephemeral X25519 keypair for the QR code
- **AND** the phone scans the QR and extracts the extension's public key
- **THEN** both sides SHALL perform X25519 ECDH to derive a shared secret
- **AND** SHALL derive Noise cipher states from this shared secret using HKDF
- **AND** SHALL use these cipher states to encrypt/decrypt signaling messages
