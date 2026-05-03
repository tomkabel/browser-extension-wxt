## ADDED Requirements

### Requirement: Coverage provider is configured in vitest.config.ts

The vitest.config.ts SHALL include a `coverage` configuration block using `@vitest/coverage-v8` as provider.

#### Scenario: Coverage provider is v8
- **WHEN** vitest runs with `--coverage` flag
- **THEN** it SHALL use V8 native coverage instrumentation, not istanbul

#### Scenario: Coverage includes relevant source directories
- **WHEN** coverage report is generated
- **THEN** it SHALL include files matching `lib/`, `entrypoints/background/`, and `entrypoints/content/`

#### Scenario: Entrypoint index files are excluded
- **WHEN** coverage report is generated
- **THEN** it SHALL exclude `index.ts` files in entrypoint directories and type declaration files

### Requirement: Coverage thresholds are enforced

The vitest.config.ts coverage configuration SHALL enforce thresholds of 70% lines and 70% branches.

#### Scenario: Coverage below threshold fails CI
- **WHEN** `bun run test:coverage` runs and coverage is below 70% lines or 70% branches
- **THEN** the vitest process SHALL exit with a non-zero code

#### Scenario: Coverage meets thresholds passes
- **WHEN** `bun run test:coverage` runs and coverage meets or exceeds 70% lines and 70% branches
- **THEN** the vitest process SHALL exit with code 0

### Requirement: Coverage npm script is configured

The project SHALL have a `test:coverage` script in package.json.

#### Scenario: test:coverage runs vitest with coverage flag
- **WHEN** `bun run test:coverage` is executed
- **THEN** vitest SHALL run all tests and produce a coverage report
