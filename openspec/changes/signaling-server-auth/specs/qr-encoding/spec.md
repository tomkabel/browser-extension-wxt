## MODIFIED Requirements

### Requirement: commitment-in-qr-payload
- The QR code payload format SHALL be extended to include the `commitment` field alongside `roomId`, `sasCode`, and `nonce`
- The `qrcode` library in `lib/channel/qrCode.ts` SHALL encode the commitment in the pairing URL

### Requirement: backward-compatible-url
- The pairing URL format SHALL remain parseable by older phone apps (the new `commitment` field SHALL be optional in the URL parser, but SHALL be required by the signaling server to complete connection)
