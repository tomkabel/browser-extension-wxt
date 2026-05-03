---
name: tailwindcss
description: Expert in Tailwind CSS 4 for SmartID2 browser extension — CSS-first configuration, v4 migration patterns, dark mode, and performance optimization.
---

# Tailwind CSS 4 for SmartID2

This project uses **Tailwind CSS 4** with React 19 and WXT. Tailwind v4 is a significant departure from v3: it is CSS-first, drops `tailwind.config.js` by default, and uses native CSS imports and cascade layers.

## Tailwind CSS 4 vs. v3: Key Changes

| Feature | v3 | v4 |
|---------|----|----|
| Configuration | `tailwind.config.js` | CSS-first (or optional `tailwind.config.js`) |
| Import | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| Theme | JS object in config | CSS variables in `@theme` |
| Custom utilities | `addUtilities` plugin | `@utility` in CSS |
| Dark mode | `darkMode: 'class'` | `@media (prefers-color-scheme: dark)` or class strategy |
| Engine | Tailwind engine | Lightning CSS (faster) |

## CSS-First Configuration

Tailwind v4 does not require `tailwind.config.js`. Customization happens directly in CSS.

### Entry CSS File

Create a single CSS entry point (e.g., `assets/tailwind.css`):

```css
@import "tailwindcss";

@theme {
  /* Extend or override the default theme */
  --color-primary: #0ea5e9;
  --color-primary-dark: #0284c7;
  --color-surface: #ffffff;
  --color-surface-dark: #0f172a;

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
}

/* Optional: keep a tailwind.config.js for complex plugin logic */
/* @config "../tailwind.config.js"; */
```

### Importing in WXT Entrypoints

In WXT/React entrypoints, import the CSS file:

```tsx
// entrypoints/popup/main.tsx
import "~/assets/tailwind.css";
```

WXT's Vite integration processes the CSS and extracts it into the extension bundle.

## Theme Customization with CSS Variables

Use `@theme` to register design tokens. These become available as utility classes.

```css
@theme {
  --color-brand-50: #f0f9ff;
  --color-brand-100: #e0f2fe;
  --color-brand-500: #0ea5e9;
  --color-brand-600: #0284c7;
  --color-brand-900: #0c4a6e;

  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 2rem;

  --shadow-card: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}
```

Usage in JSX:

```tsx
<div className="bg-brand-500 text-white shadow-card p-md rounded-lg">
  Hello SmartID2
</div>
```

## `@layer components` and `@layer utilities`

In v4, use native CSS `@layer` to define component and utility styles.

### Component Layer

```css
@layer components {
  .btn {
    @apply inline-flex items-center justify-center px-md py-sm rounded-md font-medium transition-colors;
  }

  .btn-primary {
    @apply btn bg-brand-500 text-white hover:bg-brand-600;
  }

  .btn-secondary {
    @apply btn bg-surface border border-gray-300 hover:bg-gray-50;
  }
}
```

### Utility Layer

```css
@layer utilities {
  .text-balance {
    text-wrap: balance;
  }

  .scrollbar-hidden {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }
}
```

**Important**: Avoid `@apply` inside component files when possible. Prefer utility classes directly in JSX. Use `@layer components` only for highly repeated structures.

## Dark Mode in v4

Tailwind v4 supports dark mode via CSS media queries or a class strategy.

### Media Query Strategy (Default)

```css
@theme {
  --color-bg: #ffffff;
  --color-bg-dark: #0f172a;
  --color-text: #1e293b;
  --color-text-dark: #f8fafc;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: var(--color-bg-dark);
    color: var(--color-text-dark);
  }
}
```

### Class Strategy (Manual Toggle)

If the extension popup allows toggling dark mode manually:

```css
@theme {
  --color-bg: #ffffff;
  --color-bg-dark: #0f172a;
}

html {
  background-color: var(--color-bg);
}

html.dark {
  background-color: var(--color-bg-dark);
}
```

```tsx
// Toggle dark mode in popup
<html className={isDark ? "dark" : ""}>
```

## Performance and Bundle Size in Browser Extensions

Browser extensions have strict size limits (e.g., Chrome Web Store review thresholds). Keep CSS lean:

1. **Single entry point**: Import Tailwind CSS once in a shared entry CSS file. Do not import it in every component.
2. **Purge / content detection**: WXT + Vite automatically scans entrypoints for class names. Ensure all source files are in `content` (configured automatically by WXT's Tailwind integration).
3. **Avoid `@apply` bloat**: Each `@apply` generates CSS rules. Prefer raw utility classes in JSX to maximize reuse.
4. **Minimize custom `@theme` tokens**: Only define tokens used in the project. Unused CSS variables still add bytes.
5. **Use `cn()` for conditional classes**: Prevents duplicate class strings and helps tree-shaking.

```tsx
import { cn } from "~/lib/utils";

<div className={cn(
  "flex items-center gap-sm rounded-md px-md py-sm",
  variant === "primary" && "bg-brand-500 text-white",
  variant === "secondary" && "bg-surface border",
  isDisabled && "opacity-50 cursor-not-allowed"
)} />
```

## Integration with React 19 and WXT

### React 19 Compatibility

- Tailwind CSS 4 works seamlessly with React 19.
- Use standard `className` prop (not `class`).
- React 19's improved hydration is compatible with WXT's SSR-free popup/content script architecture.

### WXT-Specific Patterns

- **Popup**: Import `~/assets/tailwind.css` in `entrypoints/popup/main.tsx`.
- **Content Script**: If injecting UI into pages, scope Tailwind styles to avoid leaking into the host page. Use a Shadow DOM wrapper or prefix classes:

```tsx
// Scoped content script UI
const container = document.createElement("div");
container.id = "smartid2-root";
const shadow = container.attachShadow({ mode: "open" });

const style = document.createElement("style");
style.textContent = tailwindCssString; // Inlined critical CSS
shadow.appendChild(style);
shadow.appendChild(reactRoot);
document.body.appendChild(container);
```

- **Auth page (`entrypoints/auth/`)**: Same Tailwind import pattern as popup.
- **Offscreen document**: Minimal styling; avoid importing full Tailwind if unused.

### Custom Font Loading

Load fonts via `web_accessible_resources` in `wxt.config.ts` or use system fonts to avoid network requests:

```css
@theme {
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

## Migrating from Tailwind v3

If encountering a v3 codebase:

1. Replace `@tailwind base; @tailwind components; @tailwind utilities;` with `@import "tailwindcss";`.
2. Move theme customizations from `tailwind.config.js` to `@theme` in CSS.
3. Replace plugin `addUtilities` with `@utility` or `@layer utilities`.
4. Update dark mode strategy from `darkMode: 'class'` to class-based `@theme` or media queries.
5. Verify WXT/Vite integration — WXT 0.20+ supports Tailwind v4 natively.

## Quick Reference

| Task | v4 Pattern |
|------|-----------|
| Import Tailwind | `@import "tailwindcss";` |
| Custom color | `@theme { --color-brand: #0ea5e9; }` |
| Custom utility | `@utility text-balance { text-wrap: balance; }` |
| Custom component | `@layer components { .btn { @apply ... } }` |
| Dark mode | `@media (prefers-color-scheme: dark)` or `.dark` class |
| Config file | Optional; use `@config` if needed |
