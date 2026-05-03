## Why

A financial security product requires hardened CSP, rigorous testing, and penetration testing before deployment. Loose CSP wildcards, untested crypto, and unverified edge cases create unacceptable risk.

## What Changes

- **CSP hardening**: Replace wildcards with specific signaling server domain only
- **Noise property-based tests**: Encrypt/decrypt round-trip (1000 random payloads), wrong-key rejection, sequence monotonicity, key rotation correctness
- **Noise test vectors**: Run official Noise Protocol test vectors for XX and IK patterns
- **Differential fuzzing**: Compare TypeScript and Java Noise implementations against each other
- **Wycheproof vectors**: Run Google's Wycheproof test vectors for ChaCha20-Poly1305
- **Integration tests**: Full end-to-end pairing → MFA → command → response flow
- **Penetration test plan**: Replay attacks, MITM on signaling, QR relay, session hijacking, SW restart scenarios
- **Command signing audit**: Verify non-repudiation signatures on transaction responses

## Capabilities

### New Capabilities

- `csp-hardening`: Narrowed connect-src to signaling server only; no ws:// or wss:// wildcards
- `noise-property-tests`: Property-based testing for Noise implementation
- `noise-test-vectors`: Verification against official Noise Protocol test vectors
- `penetration-test-plan`: Documented attack scenarios and mitigations
- `e2e-integration-tests`: Playwright (extension) + adb (phone) end-to-end testing

### Modified Capabilities

None — these are entirely new capabilities.

## Impact

- `wxt.config.ts` — CSP update to remove wildcards
- `lib/channel/noiseXX.test.ts` — Property-based tests + test vectors
- `lib/channel/noiseIK.test.ts` — Property-based tests + test vectors
- `e2e/` — New E2E test suite
- `research/penetration-test-plan.md` — Documented test scenarios
