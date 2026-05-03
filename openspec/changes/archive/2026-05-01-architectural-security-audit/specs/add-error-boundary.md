# Add React Error Boundary to Popup

## Version History

| Version | Date       | Author | Change Description |
|---------|------------|--------|-------------------|
| 1.0.0   | 2026-05-01 | Audit  | Initial spec      |

## Specification

### Problem

The popup React tree (`App.tsx`) has no error boundary. Any uncaught exception in a panel component (e.g., a `browser.runtime.sendMessage` rejection that escapes the handler, a lazy-load failure in `React.lazy()`, or a Zustand subscription error) will unmount the entire popup tree, leaving the user with a blank popup and no recovery mechanism.

### Solution

1. Create `entrypoints/popup/ErrorBoundary.tsx` implementing `componentDidCatch` with a fallback UI showing an error message and a "Reload Extension" button that calls `chrome.runtime.reload()`.
2. Wrap the `PanelRouter` component (and optionally the entire `PopupApp`) in the boundary.
3. Ensure the boundary catches lazy-load failures from `Suspense` fallback gaps (when a lazy component throws before Suspense catches, which can happen with race conditions in HMR).

### Acceptance Criteria

- An error thrown in any panel component renders the fallback UI instead of a blank popup.
- The "Reload Extension" button successfully reloads the extension.
- Unit tests verify the boundary renders children normally and catches thrown errors.
