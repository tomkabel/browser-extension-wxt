## ADDED Requirements

### Requirement: RN project initialisation

The React Native project SHALL be initialised with TypeScript strict mode, Hermes engine, and Metro bundler.

#### Scenario: Project builds
- **WHEN** `npx react-native init SmartIDVault --template react-native-template-typescript` is run
- **THEN** the project SHALL build successfully with `npx react-native run-android`

#### Scenario: TypeScript strict mode
- **WHEN** `tsconfig.json` is examined
- **THEN** `strict: true` SHALL be set, `noUncheckedIndexedAccess` SHALL be true

#### Scenario: Metro bundler failure
- **WHEN** `npx react-native start` is run with a syntax error in any `.tsx` file
- **THEN** Metro SHALL display the error with file path and line number
- **AND** the app SHALL show a red-boxed error on the device/emulator
- **AND** the build SHALL NOT produce a valid bundle

#### Scenario: Hermes engine unavailable
- **WHEN** the app launches on a device that does not support Hermes (Android < 7)
- **THEN** the app SHALL crash with a clear error message referencing Hermes engine requirement
- **AND** this is acceptable because minSdk 26 guarantees Hermes support
