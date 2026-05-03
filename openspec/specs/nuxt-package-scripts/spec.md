## ADDED Requirements

### Requirement: Package scripts include CI parity command

The project package.json SHALL include a `ci:check` script that runs typecheck, tests, and build in sequence for local CI parity.

#### Scenario: ci:check runs all verifications
- **WHEN** `bun run ci:check` is executed
- **THEN** it SHALL run `bun run tsc --noEmit && bun run test && bun run build`

### Requirement: Package scripts include E2E commands

The project package.json SHALL include `test:e2e` and `test:e2e:ui` scripts.

#### Scenario: test:e2e invokes Playwright
- **WHEN** `bun run test:e2e` is executed
- **THEN** it SHALL invoke `playwright test`

#### Scenario: test:e2e:ui invokes Playwright UI mode
- **WHEN** `bun run test:e2e:ui` is executed
- **THEN** it SHALL invoke `playwright test --ui`

### Requirement: Package scripts include coverage command

The project package.json SHALL include a `test:coverage` script.

#### Scenario: test:coverage runs vitest with coverage
- **WHEN** `bun run test:coverage` is executed
- **THEN** it SHALL invoke `vitest run --coverage`
