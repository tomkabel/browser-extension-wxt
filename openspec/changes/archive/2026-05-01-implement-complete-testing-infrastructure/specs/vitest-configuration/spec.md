## ADDED Requirements

### Requirement: Vitest config includes coverage settings

The vitest.config.ts SHALL include a `test.coverage` block with provider, include, exclude, and thresholds configuration.

#### Scenario: Coverage provider is set to v8
- **WHEN** vitest.config.ts is loaded
- **THEN** `test.coverage.provider` SHALL equal `'v8'`

#### Scenario: Coverage include patterns cover source directories
- **WHEN** vitest.config.ts is loaded
- **THEN** `test.coverage.include` SHALL contain `'lib/'`, `'entrypoints/background/'`, and `'entrypoints/content/'`

#### Scenario: Coverage exclude patterns filter boilerplate
- **WHEN** vitest.config.ts is loaded
- **THEN** `test.coverage.exclude` SHALL exclude `index.ts` entrypoint files and type declaration files

#### Scenario: Coverage thresholds are configured
- **WHEN** vitest.config.ts is loaded
- **THEN** `test.coverage.thresholds.lines` SHALL equal `70` and `test.coverage.thresholds.branches` SHALL equal `70`
