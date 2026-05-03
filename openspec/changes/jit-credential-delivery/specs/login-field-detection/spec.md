## ADDED Requirements

### Requirement: Password field detection

The content script SHALL detect password input fields on the current page, both on initial load and after dynamic DOM changes (SPA navigation).

#### Scenario: Standard login form detected

- **WHEN** the page contains an `input[type="password"]` element
- **AND** a corresponding `input[type="text"]` or `input[type="email"]` element exists in the same form
- **THEN** the content script SHALL emit a `detect-login-form` message with field selectors

#### Scenario: No login form on page

- **WHEN** the page contains no `input[type="password"]` or `input[autocomplete="current-password"]` element
- **THEN** the content script SHALL NOT emit a `detect-login-form` message

#### Scenario: SPA route change triggers re-detection

- **WHEN** the page URL changes via client-side navigation (`wxt:locationchange` event)
- **THEN** the content script SHALL re-scan for login forms
- **AND** if a new login form appears, SHALL emit a new `detect-login-form` message

### Requirement: MutationObserver-based detection

The content script SHALL use a `MutationObserver` to detect login forms added to the DOM after initial page load.

#### Scenario: Login form added dynamically

- **WHEN** a password field is inserted into the DOM after the initial page load
- **THEN** the `MutationObserver` SHALL detect the insertion within 500ms (debounced)
- **AND** the content script SHALL emit a `detect-login-form` message

#### Scenario: Multiple rapid DOM changes debounced

- **WHEN** a framework renders multiple DOM updates within 500ms
- **THEN** the content script SHALL emit at most one `detect-login-form` message
- **AND** the message SHALL reflect the final DOM state after debouncing

### Requirement: Detection result includes field information

The `detect-login-form` message SHALL include enough information for the extension to inject credentials later.

#### Scenario: Detection result format

- **WHEN** a login form is detected
- **THEN** the message payload SHALL include:
  - `usernameSelector`: CSS selector for the username/email field
  - `passwordSelector`: CSS selector for the password field
  - `formAction`: The form's `action` attribute or page URL
  - `domain`: The current page's registrable domain
  - `url`: The full page URL
