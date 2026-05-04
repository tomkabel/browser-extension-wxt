## ADDED Requirements

### Requirement: prefers-reduced-motion-respect
The popup CSS SHALL include a `@media (prefers-reduced-motion: reduce)` block that disables all CSS animations and transitions:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Requirement: immediate-panel-switch
- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** panel transitions SHALL be instantaneous (no slide/fade animations)
