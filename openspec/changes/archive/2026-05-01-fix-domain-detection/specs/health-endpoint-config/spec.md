## ADDED Requirements

### Requirement: Health endpoint uses /health path

The health check SHALL use the `/health` path on the configured API endpoint, not `/api/health`.

#### Scenario: Health check request URL

- **WHEN** `ApiRelay.healthCheck()` is called and the configured API endpoint is `https://youtube.tomabel.ee`
- **THEN** the request SHALL be sent to `https://youtube.tomabel.ee/health`
- **AND** the request method SHALL be GET

### Requirement: Default API endpoint fallback

The default API endpoint fallback SHALL be `https://youtube.tomabel.ee`.

#### Scenario: No user-configured endpoint

- **WHEN** no value has been stored for `local:apiEndpoint`
- **THEN** the extension SHALL use `https://youtube.tomabel.ee` as the API endpoint
