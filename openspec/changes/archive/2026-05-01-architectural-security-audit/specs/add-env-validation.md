# Add Build-Time Environment Variable Validation

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

Three runtime-critical endpoints use hardcoded fallback URLs that may not be appropriate for all deployment environments:

1. `entrypoints/background/apiRelay.ts:38` — `apiEndpoint` fallback: `'https://youtube.tomabel.ee'`
2. `entrypoints/offscreen-webrtc/main.ts:3` — Signaling URL: `import.meta.env.VITE_SIGNALING_URL ?? 'https://smartid2-signaling.fly.dev'`
3. `wxt.config.ts:58` — CSP `connect-src`: `https://smartid2-signaling.fly.dev wss://smartid2-signaling.fly.dev`

Production CSP must only allow the actual signaling server, not a hardcoded dev domain.

### Solution

1. Define environment variables via Vite/WXT's `import.meta.env`:
   - `VITE_API_ENDPOINT` — validated as a `https://` URL at build time.
   - `VITE_SIGNALING_URL` — validated as a `https://` URL at build time.
   - `VITE_SIGNALING_WS_URL` — derived from `VITE_SIGNALING_URL` (https → wss) for CSP.
2. In `wxt.config.ts`, read these vars and inject into the CSP `connect-src` directive.
3. In `apiRelay.ts`, remove the hardcoded fallback and make the endpoint configurable via env.
4. Create a `.env.example` file documenting required variables.
5. Add a `prebuild` script that validates required env vars are set (fails fast with a clear message).

### Acceptance Criteria

- `VITE_API_ENDPOINT` and `VITE_SIGNALING_URL` must be set before `bun run build` or the build fails with a descriptive error.
- CSP `connect-src` contains only the configured signaling URL.
- The `.env.example` file documents all variables.
- Dev workflow works with `.env` file; CI sets explicit values.
