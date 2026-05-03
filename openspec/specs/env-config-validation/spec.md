# env-config-validation Specification

## Purpose

Ensure the extension fails safely at build time when required environment variables are missing, and that all configurable endpoints (API, signaling, TURN) are driven by environment variables rather than hardcoded values. This prevents silent deployment failures and enables per-environment configuration.

## Requirements
### Requirement: Build-time environment variable validation

The build process SHALL validate that required environment variables are set before compilation.

#### Scenario: Build fails when env vars missing

- **WHEN** `bun run build` is executed
- **AND** `VITE_API_ENDPOINT` is not set
- **THEN** the build SHALL fail with a descriptive error message: `VITE_API_ENDPOINT is required`

#### Scenario: Build succeeds when env vars set

- **WHEN** `bun run build` is executed
- **AND** both `VITE_API_ENDPOINT` and `VITE_SIGNALING_URL` are set to valid `https://` URLs
- **THEN** the build SHALL succeed

### Requirement: Configurable API endpoint

The `apiEndpoint` in `apiRelay.ts` SHALL use `import.meta.env.VITE_API_ENDPOINT` instead of the hardcoded fallback.

#### Scenario: API endpoint from environment

- **WHEN** `VITE_API_ENDPOINT=https://api.example.com` is set
- **THEN** `ApiRelay.send()` SHALL POST to `https://api.example.com/api/dom-content`
- **AND** `ApiRelay.healthCheck()` SHALL GET `https://api.example.com/health`

### Requirement: Configurable signaling URL in CSP

The `connect-src` CSP directive SHALL include the configured signaling server URL.

#### Scenario: CSP reflects signaling URL

- **WHEN** `VITE_SIGNALING_URL=https://signal.example.com` is set
- **THEN** the generated manifest CSP SHALL include `connect-src 'self' https://signal.example.com wss://signal.example.com`
