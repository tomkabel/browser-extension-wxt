## ADDED Requirements

### Requirement: Credential detection complements transaction detection

The content script SHALL support both transaction detection (banking pages) and credential detection (login pages) as complementary features.

#### Scenario: Login page detected instead of transaction

- **WHEN** the user navigates to a page with a login form but no transaction data
- **THEN** `detectLoginForm()` SHALL return a valid result
- **AND** `detectTransaction()` SHALL return `null`
- **AND** the popup SHALL display credential-related UI (not transaction UI)

#### Scenario: Transaction page detected instead of login

- **WHEN** the user is on a banking transaction page
- **THEN** `detectTransaction()` SHALL return transaction data
- **AND** the popup SHALL display transaction verification UI
