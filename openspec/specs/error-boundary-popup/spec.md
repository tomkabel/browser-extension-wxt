# error-boundary-popup Specification

## Purpose

Provide a resilient popup UI by wrapping React panel components in an Error Boundary that prevents any single panel crash from taking down the entire popup. This is critical for a security extension where the user must always be able to see their connection status and access recovery options, even if one panel encounters a rendering error.

## Requirements
### Requirement: Error Boundary catches render errors

The popup React tree SHALL be wrapped in an Error Boundary that catches uncaught exceptions from panel components.

#### Scenario: Error boundary renders fallback on crash

- **WHEN** a panel component throws an error during render, effect, or event handler
- **THEN** the Error Boundary SHALL catch the error
- **AND** SHALL display a fallback UI with an error message
- **AND** SHALL provide a "Reload Extension" button that calls `chrome.runtime.reload()`

### Requirement: Error Boundary preserves healthy components

The Error Boundary SHALL only replace the crashed subtree; sibling components SHALL remain functional.

#### Scenario: One panel crashes, others remain

- **WHEN** `PairingPanel` throws an error
- **THEN** only the panel section SHALL show the error fallback
- **AND** the popup header and footer SHALL remain visible

### Requirement: Error Boundary handles async/lazy loading failures

The Error Boundary SHALL catch errors from `React.lazy()` components and `Suspense` fallback gaps.

#### Scenario: Lazy-loaded panel fails to load

- **WHEN** a lazy-loaded panel module fails to load (network error, parse error)
- **THEN** the Error Boundary SHALL catch the error
- **AND** SHALL display the fallback UI
