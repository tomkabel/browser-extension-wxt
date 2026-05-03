## ADDED Requirements

### Requirement: GitHub Actions workflow exists for CI

The project SHALL have `.github/workflows/test.yml` defining a CI pipeline triggered on push to main/develop and pull_request to main.

#### Scenario: Workflow triggers on push to main
- **WHEN** a commit is pushed to the `main` branch
- **THEN** the `unit-and-integration` job SHALL run automatically

#### Scenario: Workflow triggers on PR to main
- **WHEN** a pull request is opened against `main`
- **THEN** both `unit-and-integration` and `e2e` jobs SHALL run

### Requirement: Unit and integration job runs typecheck and tests

The `unit-and-integration` job SHALL checkout the repo, set up Bun, install dependencies with frozen lockfile, run `bun run tsc --noEmit`, and run `bun run test`.

#### Scenario: Typecheck runs before tests
- **WHEN** the `unit-and-integration` job executes
- **THEN** `bun run tsc --noEmit` SHALL run before `bun run test`
- **AND** the job SHALL fail if typecheck fails

#### Scenario: Bun version is pinned via setup-bun
- **WHEN** the `unit-and-integration` job installs Bun
- **THEN** it SHALL use `oven-sh/setup-bun@v2` with `bun-version: latest`

### Requirement: E2E job runs on PRs only

The `e2e` job SHALL depend on `unit-and-integration` and SHALL only run when `github.event_name == 'pull_request'`.

#### Scenario: E2E job is skipped on push
- **WHEN** a commit is pushed to `main` (not a PR)
- **THEN** the `e2e` job SHALL be skipped

#### Scenario: E2E job runs after unit tests pass on PR
- **WHEN** a pull request is opened and `unit-and-integration` succeeds
- **THEN** the `e2e` job SHALL execute: checkout → setup Bun → install deps → install Playwright Chromium with deps → `bun run build` → `bun run test:e2e`
