## ADDED Requirements

### Requirement: wcag-aa-contrast
All text in the popup SHALL meet WCAG AA minimum contrast ratios:
- Normal text (< 18pt): 4.5:1
- Large text (≥ 18pt or ≥ 14pt bold): 3:1

### Requirement: contrast-audit-tool
The E2E test suite SHALL include a color contrast audit using `@axe-core/playwright` that checks all visible text elements.

#### Scenario: contrast-passes
- **WHEN** the popup is rendered in any panel state
- **THEN** the axe-core contrast audit SHALL pass with zero violations
