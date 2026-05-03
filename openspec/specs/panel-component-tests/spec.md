## ADDED Requirements

### Requirement: DomainPanel component has test coverage

The project SHALL have `entrypoints/popup/panels/DomainPanel.test.tsx` covering all render states of the DomainPanel component.

#### Scenario: DomainPanel renders loading skeleton
- **WHEN** the DomainPanel component is mounted and domain data has not yet resolved
- **THEN** a skeleton placeholder with `animate-pulse` SHALL be displayed

#### Scenario: DomainPanel renders domain data
- **WHEN** `browser.runtime.sendMessage` resolves with `{ success: true, data: { domain: 'www.lhv.ee', registrableDomain: 'lhv.ee', isPublic: true } }`
- **THEN** the component SHALL display `www.lhv.ee` in green text and a "Public" badge

#### Scenario: DomainPanel shows no domain message
- **WHEN** `browser.runtime.sendMessage` resolves with `{ success: false, error: 'No domain recorded' }`
- **THEN** the component SHALL display "No domain detected" text

#### Scenario: DomainPanel shows error state
- **WHEN** `browser.runtime.sendMessage` rejects with an error
- **THEN** the component SHALL display "No domain detected" text (error fallback renders the same empty state)

#### Scenario: DomainPanel refetches on tab change
- **WHEN** `browser.tabs.onActivated` fires
- **THEN** the component SHALL re-invoke the fetchDomain function

### Requirement: ApiPanel component has test coverage

The project SHALL have `entrypoints/popup/panels/ApiPanel.test.tsx` covering all render states of the ApiPanel component.

#### Scenario: ApiPanel renders health indicator and send button
- **WHEN** the ApiPanel component is mounted and health check resolves successfully
- **THEN** a green health dot SHALL be visible and a "Send Data to API" button SHALL be rendered

#### Scenario: ApiPanel shows sending state
- **WHEN** "Send Data to API" button is clicked
- **THEN** the button SHALL be disabled and display "Sending..."

#### Scenario: ApiPanel shows error with retry button
- **WHEN** the send operation fails
- **THEN** the error message SHALL be displayed in a red-bordered box and a "Retry" button SHALL be visible

#### Scenario: ApiPanel shows success with timestamp
- **WHEN** the send operation succeeds
- **THEN** the status SHALL show "Sent" and a "Last sent" timestamp SHALL be displayed

#### Scenario: ApiPanel shows unhealthy API indicator
- **WHEN** the health check fails on mount
- **THEN** a red health dot SHALL be displayed
