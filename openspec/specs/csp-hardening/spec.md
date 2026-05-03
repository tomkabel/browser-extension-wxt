# csp-hardening Specification

## Purpose

Harden the extension's Content Security Policy to prevent clickjacking attacks by restricting which contexts extension pages can be embedded in. The `frame-ancestors 'none'` directive prevents malicious websites from framing the auth page in iframes to capture WebAuthn assertions via clickjacking.

## Requirements
### Requirement: frame-ancestors directive prevents clickjacking

The Content Security Policy for extension pages SHALL include `frame-ancestors 'none'` to prevent the auth page from being embedded in iframes.

#### Scenario: Auth page cannot be framed

- **WHEN** an external page attempts to load `auth.html` in an `<iframe>`, `<frame>`, or `<object>`
- **THEN** the browser SHALL block the frame load
- **AND** SHALL emit a CSP violation

#### Scenario: Popup renders normally

- **WHEN** the popup opens in its own dedicated popup window
- **THEN** CSP `frame-ancestors 'none'` SHALL NOT affect normal popup rendering
