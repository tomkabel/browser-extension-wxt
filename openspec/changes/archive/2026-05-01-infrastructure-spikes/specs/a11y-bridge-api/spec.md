## ADDED Requirements

### Requirement: /ping health check

The a11y-bridge API SHALL expose a health check endpoint at `/ping`.

#### Scenario: Health check returns ok

- **WHEN** a GET request is sent to `http://127.0.0.1:7333/ping`
- **THEN** the response SHALL have HTTP status 200
- **AND** the body SHALL be valid JSON containing `{"status": "ok"}`

### Requirement: /screen returns UI tree

The a11y-bridge API SHALL expose the current screen's accessibility node tree at `/screen`.

#### Scenario: Full UI tree

- **WHEN** a GET request is sent to `http://127.0.0.1:7333/screen`
- **THEN** the response SHALL be valid JSON
- **AND** contain a `nodes` array
- **AND** each node SHALL have at minimum `text`, `bounds`, and `click` fields

#### Scenario: Compact UI tree

- **WHEN** a GET request is sent to `http://127.0.0.1:7333/screen?compact`
- **THEN** the response SHALL only include nodes with meaningful content (text, clickable, editable)
- **AND** the response time SHALL be less than 100ms

### Requirement: /click by text

The a11y-bridge API SHALL support clicking an element by its visible text via POST `/click`.

#### Scenario: Click element by text

- **WHEN** a POST request is sent to `http://127.0.0.1:7333/click`
- **AND** the body is `{"text": "Settings"}`
- **THEN** the response SHALL have `{"clicked": true}`
- **AND** the element with text "Settings" SHALL receive a click action

#### Scenario: Click by resource ID

- **WHEN** a POST request is sent to `http://127.0.0.1:7333/click`
- **AND** the body is `{"id": "com.android.settings:id/search_bar"}`
- **THEN** the response SHALL have `{"clicked": true}`
