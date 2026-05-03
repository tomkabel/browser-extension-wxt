## ADDED Requirements

### Requirement: Credential request command type

The CommandClient SHALL support a `credential-request` command type sent over the WebRTC Data Channel to request credentials from the phone's vault.

#### Scenario: Credential request sent

- **WHEN** the extension detects a login form on the current page
- **THEN** the extension SHALL send a `credential-request` command with payload `{ domain, url, usernameFieldId, passwordFieldId }`

#### Scenario: Credential request rate-limited

- **WHEN** a credential request is sent for domain `example.com`
- **THEN** no additional credential request for the same domain SHALL be sent within 30 seconds
- **AND** subsequent requests within the window SHALL be silently dropped

### Requirement: Credential response micro-payload

The phone SHALL respond to a `credential-request` with a micro-payload containing only the requested site's credentials.

#### Scenario: Credential found in vault

- **WHEN** the phone receives a `credential-request` for domain `example.com`
- **AND** credentials exist in the vault for `example.com`
- **THEN** the phone SHALL decrypt the credentials locally
- **AND** respond with `{ status: 'found', username: '<username>', password: '<password>' }`
- **AND** the response SHALL be encrypted over the Noise channel

#### Scenario: Credential not found in vault

- **WHEN** the phone receives a `credential-request` for a domain with no stored credentials
- **THEN** the phone SHALL respond with `{ status: 'not_found' }`

### Requirement: Credential request timeout

The extension SHALL time out a credential request if no response arrives within 10 seconds.

#### Scenario: Request times out

- **WHEN** a `credential-request` is sent
- **AND** no response arrives within 10 seconds
- **THEN** the extension SHALL display "Phone not responding" in the popup
- **AND** the pending command SHALL be rejected
