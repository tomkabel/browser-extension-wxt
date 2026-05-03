# Remove Committed Secrets and Artifacts from Repository

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

The repository root contains several files that must never be version-controlled:

- `smartid2-key.pem` — RSA private key (leaked signing capability).
- `mydatabase.db` — SQLite database files in both root and `signaling-server/` directories (runtime data / potential user data exposure).
- `a11y-bridge.apk` — Binary APK file (47+ MB of opaque binary in git history).

### Solution

1. Immediately `git rm --cached` each file.
2. Add entries to `.gitignore`:
   - `*.pem`
   - `*.db`
   - `*.apk`
   - `*.key`
   - `credentials.*`
3. Rotate the key material: the RSA key in `wxt.config.ts:key` must be regenerated (it is now compromised by git history). The `smartid2-key.pem` keypair must be replaced.
4. Add a pre-push hook that blocks files matching these patterns.

### Acceptance Criteria

- `git status` shows no tracked `.pem`, `.db`, or `.apk` files.
- `.gitignore` blocks future commits of these patterns.
- A new extension signing key is generated and deployed.
- CI pipeline validates no secret-matching files are present.
