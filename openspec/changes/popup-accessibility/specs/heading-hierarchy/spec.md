## ADDED Requirements

### Requirement: panel-h1-titles
Each panel component SHALL render an `<h1>` with the panel title (e.g., "Pairing", "Authentication", "Transaction Verification", "Credential Auto-Fill"). The `<h1>` SHALL be visually hidden via Tailwind `sr-only` class.

### Requirement: section-h2-structure
Sections within panels SHALL use `<h2>` for their titles. Example: "Device List" section in AuthPanel, "Transaction Details" section in TransactionPanel.

### Requirement: single-h1-per-popup
There SHALL be exactly one `<h1>` visible in the popup DOM at any time (the active panel's title).
