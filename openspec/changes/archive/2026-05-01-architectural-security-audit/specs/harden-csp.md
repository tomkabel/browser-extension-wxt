# Harden Content Security Policy

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

The `content_security_policy.extension_pages` directive in `wxt.config.ts:56-58` is missing `frame-ancestors`, which controls which parent origins may embed the extension's pages in `<frame>`, `<iframe>`, or `<object>` elements. The auth page (`auth.html`) is registered as a web-accessible resource with `matches: ['<all_urls>']` (`wxt.config.ts:50-52`), meaning any website can frame it. Without `frame-ancestors`, an attacker site could embed the auth page in a hidden iframe and socially engineer the user into registering or authenticating a credential under attacker-controlled context (clickjacking / tapjacking).

Current CSP:
```
default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self' https://smartid2-signaling.fly.dev wss://smartid2-signaling.fly.dev; frame-src 'self';
```

### Solution

Add `frame-ancestors 'none'` to the CSP:

```
default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self' https://smartid2-signaling.fly.dev wss://smartid2-signaling.fly.dev; frame-src 'self'; frame-ancestors 'none';
```

### Acceptance Criteria

- CSP validation tools report no `frame-ancestors` violation.
- Attempting to load `auth.html` in an iframe on any page results in a denied frame (verified via E2E test).
- `wxt build` succeeds with the updated manifest.
