## ADDED Requirements

### Requirement: go-unit-tests-in-ci
The CI pipeline at `.github/workflows/test.yml` SHALL include a job that runs `go test ./... -race -count=1` in the `apps/native-host/` directory.

### Requirement: go-vet-in-ci
The CI pipeline SHALL run `go vet ./...` in `apps/native-host/`.

### Requirement: staticcheck-in-ci
The CI pipeline SHALL run `staticcheck ./...` in `apps/native-host/`.

#### Scenario: go-tests-pass
- **WHEN** a PR modifies `apps/native-host/`
- **THEN** all Go tests, vet, and staticcheck SHALL pass before merge
