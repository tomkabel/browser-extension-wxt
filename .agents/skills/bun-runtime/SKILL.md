---
name: bun-runtime
description: Bun as package manager, runtime, and build tool for SmartID2. Project-specific patterns for WXT + React + TypeScript + Vitest workflows.
---

# Bun Runtime for SmartID2

This project uses **Bun exclusively** as its package manager and runtime. Do not use npm, pnpm, or yarn. This skill covers Bun-specific patterns, migration gotchas, and integration with WXT, Vitest, and TypeScript 5.6 strict mode.

## Package Manager (`bun install`)

- **Always use `bun install`**, not `npm install`.
- The lockfile is `bun.lock` (text-based) in recent Bun versions. Earlier versions used `bun.lockb` (binary). Both are valid; commit whichever is present.
- **Commit the lockfile** for reproducible CI builds.
- To regenerate: `rm -rf node_modules bun.lock bun.lockb && bun install`.
- Use `bun install --frozen-lockfile` in CI for strict reproducibility.

### Checking for Outdated Packages

```bash
bun update
# or
bun outdated
```

## Running Scripts (`bun run`)

All npm scripts are executed with `bun run`:

```bash
bun run dev      # Start WXT dev server with HMR
bun run build    # Prebuild env validation, then wxt build, then fix-manifest.js
bun run test     # Run Vitest unit/integration tests
bun run test:e2e # Run Playwright E2E tests
bun run typecheck
bun run ci:check # Full CI pipeline: typecheck → test → build
bun run lint
bun run format
```

Note: `bun run` is required for npm scripts. For executing a file directly, `bun src/index.ts` works.

## Bun as Runtime vs. Test Runner

### Runtime

Bun is the execution runtime for all TypeScript and JavaScript in this project. It transpiles `.ts` files on the fly using its built-in transpiler (based on JavaScriptCore + Zig).

```bash
bun run scripts/validate-env.ts
```

Bun understands `tsconfig.json` path aliases (e.g., `~/lib/errors`). Ensure `"paths"` is correctly mapped in `tsconfig.json`.

### Test Runner: Vitest, NOT `bun:test`

**Critical**: This project uses **Vitest** for unit and integration tests, not Bun's built-in test runner.

- Use `bun run test` (which runs `vitest run`) instead of `bun test`.
- Vitest provides better browser extension testing support (jsdom, fakeBrowser mocks from `wxt/testing`).
- Vitest's `expect` API is compatible with Jest/expect-style assertions.
- Mock `chrome.*` APIs using `fakeBrowser` from `wxt/testing` in Vitest.

Why not `bun:test`?
- `wxt/testing` utilities are designed for Vitest.
- Vitest's module resolution and `fakeBrowser` stubs align better with WXT's testing patterns.
- Bun's test runner is faster but lacks the ecosystem mocks this project needs.

## TypeScript Execution

Bun runs TypeScript natively without pre-compilation:

```bash
bun scripts/validate-env.ts
```

For build and bundling, WXT uses Vite under the hood. Bun is used as the **package manager and task runner**, while Vite (via WXT) handles actual bundling of the extension.

### TypeScript Configuration Notes

- `noUncheckedIndexedAccess: true` is enabled. Array accesses return `T | undefined`.
- `noImplicitReturns: true` is enabled. All code paths must return.
- Bun respects `tsconfig.json` strictly. Ensure `compilerOptions` are aligned.

## Workspace / Monorepo Patterns

This project is a single-package repo. If splitting into a monorepo:

```json
// package.json
{
  "workspaces": ["packages/*"]
}
```

```bash
# Install all workspace dependencies
bun install

# Run a script in a specific workspace
bun run --filter=@smartid2/signaling-server dev
```

For now, keep it simple: single `package.json`, single `node_modules`.

## Bun-Specific Build Optimizations

1. **Lockfile caching in CI**: Cache `bun.lock` + `node_modules` for faster installs.
2. **Binary executables**: Bun can compile scripts to standalone binaries:
   ```bash
   bun build scripts/validate-env.ts --compile --outfile validate-env
   ```
   Useful for distributing CLI tools alongside the extension.
3. **Bun's built-in bundler**: While WXT handles extension bundling, Bun's bundler (`bun build`) can be used for auxiliary scripts or the signaling server if rewritten in TS.

## Common Pitfalls

### 1. Native Module Compatibility

Bun's Node.js compatibility is excellent but not 100%. If a dependency uses Node-specific C++ addons or `node-gyp`:
- Prefer pure-JS/TS alternatives.
- For `sqlite3`, use `bun:sqlite` instead.
- If a package fails, try `bun install --backend=copyfile` or report upstream.

### 2. `npm-run-all` Not Available

This project uses the shell `&` operator for parallel scripts instead of `npm-run-all`:

```json
{
  "scripts": {
    "parallel-tasks": "task-a & task-b & wait"
  }
}
```

### 3. Environment Variables in Scripts

Bun reads `.env` files automatically. Explicit loading:

```bash
bun run --env-file=.env.local dev
```

Build fails if `VITE_API_ENDPOINT` or `VITE_SIGNALING_URL` are missing (see `scripts/validate-env.ts`).

### 4. Lockfile Format Changes

If upgrading Bun causes lockfile format changes (e.g., `bun.lockb` → `bun.lock`), commit the change. Do not mix formats.

### 5. Playwright E2E with Bun

Playwright runs via `bun run test:e2e`. It uses Node internally for the test runner, but Bun manages the package and scripts. Ensure Playwright browsers are installed:

```bash
bunx playwright install chromium
```

## Quick Reference

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Install package | `bun add <pkg>` |
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Type check | `bun run typecheck` |
| Test (Vitest) | `bun run test` |
| E2E test | `bun run test:e2e` |
| Lint | `bun run lint` |
| Format | `bun run format` |
| CI check | `bun run ci:check` |
| Run script | `bun run <script>` |
| Execute file | `bun <file>.ts` |
| One-off binary | `bunx <pkg>` |
