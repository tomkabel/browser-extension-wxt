## MODIFIED Requirements

### Requirement: commitment-in-qr-payload
- The QR code payload format SHALL be extended to include the `commitment` field alongside `roomId`, `sasCode`, and `nonce`
- The `qrcode` library in `lib/channel/qrCode.ts` SHALL encode the commitment in the pairing URL

### Requirement: backward-compatible-url
- The pairing URL format SHALL remain parseable by older phone apps (the new `commitment` and `nonce` fields SHALL be optional in the URL parser, but SHALL be required by the signaling server to complete connection)

### Requirement: qr-embedded-sdp-for-serverless-pairing
- The QR code payload SHALL optionally embed the initiator's entire SDP offer (compressed) for server-less WebRTC Perfect Negotiation
- **WHEN** the extension generates a QR code during pairing
- **THEN** it SHALL create an RTCPeerConnection offer, compress the SDP JSON, and encode it in the QR as `sdp=<base64url(deframe(gzip(sdp)))>`
- **AND** the phone SHALL extract the SDP offer from the QR, create an answer locally, and establish the WebRTC connection without signaling server round-trip
- **AND** the signaling server SHALL remain available as fallback if the QR-embedded SDP fails (ICE timeout)

### Requirement: protocol-capabilities-in-qr
- The QR code payload SHALL encode the extension's protocol capabilities (protocol version, supported features, transports)
- **WHEN** the phone scans the QR
- **THEN** it SHALL immediately know the extension's capabilities and can negotiate before connecting
- **AND** reject pairing if no capability intersection exists (showing "Extension version too old, please update")
