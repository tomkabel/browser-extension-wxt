## ADDED Requirements

### Requirement: sqlite-schema
The vault SHALL use a SQLite database with the following schema:
```sql
CREATE TABLE IF NOT EXISTS credentials (
    domain TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    ciphertext BLOB NOT NULL,
    iv BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### Requirement: domain-primary-key
Domain SHALL be the primary key. One credential per domain. Upsert on save (INSERT OR REPLACE or INSERT ... ON CONFLICT).

### Requirement: username-plaintext-storage
The `username` field SHALL be stored in plaintext. Only the password (credential) value SHALL be encrypted in `ciphertext`. Rationale: the UI displays domain + username for credential selection without decrypting every entry.

#### Scenario: save-and-retrieve
- **WHEN** a credential is saved for domain `github.com` and then retrieved
- **THEN** the domain, username, ciphertext, and IV SHALL match the saved values

#### Scenario: update-existing
- **WHEN** a credential is saved again for the same domain with a different password
- **THEN** `updated_at` SHALL be updated and the old ciphertext SHALL be replaced
