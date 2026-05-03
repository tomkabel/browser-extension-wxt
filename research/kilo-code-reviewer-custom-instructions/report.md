# Kilo Code Cloud Code Reviewer: Best Custom Instructions (2026)
*Generated: 2026-05-03 | Sources: 12 | Confidence: High*

## Executive Summary

Kilo Code's Cloud Code Reviewer (launched late 2025) provides automated AI-powered PR/MR analysis on GitHub and GitLab, with local IDE reviews via `/local-review` and `/local-review-uncommitted` commands. The **Custom Instructions** feature is the primary mechanism for tailoring the reviewer's behavior to your team's standards.

Based on official Kilo documentation, community-proven custom modes, and published model benchmark data (testing GPT-5.2, Claude Opus 4.5, Gemini 3 Pro, and free models against 18 planted issues), here are the most effective custom instruction strategies.

---

## 1. Kilo Code Reviewer Architecture Overview

### Configuration Layers (highest to lowest priority)

| Layer | Location | Scope |
|---|---|---|
| Cloud Code Review custom instructions | `app.kilo.ai` Code Reviews settings | Cloud PR reviewer |
| Per-agent prompts | VS Code Settings → Agent Behaviour → Agents | Local IDE reviews |
| Project AGENTS.md | `<project-root>/AGENTS.md` | Entire project |
| Per-directory AGENTS.md | `<subdir>/AGENTS.md` | Specific directory |
| Global AGENTS.md | `~/.config/kilo/AGENTS.md` | All projects |
| `kilo.jsonc` instructions key | `.kilo/` or `kilo.jsonc` | Explicit instruction sources |

### Built-in Review Controls

- **Review Style**: Strict, Balanced, Lenient
- **Focus Areas**: Security, Performance, Bugs, Code Style, Test Coverage, Documentation
- **Max Review Time**: 5–30 minutes
- **Model Selection**: 500+ models (Claude 4 Opus, GPT-5.2, Gemini 3 Pro, Grok Code Fast 1, etc.)

### Custom Instructions Are the Differentiator

The built-in controls set broad parameters. Custom Instructions are where you encode:
- Team-specific coding conventions
- Architectural patterns and constraints
- Preferred libraries and frameworks
- Domain-specific security rules
- Project-specific anti-patterns to flag

---

## 2. Proven Custom Instruction Templates (2026 Community Standards)

### 2a. Comprehensive Team Standard (Recommended for most teams)

This is the most commonly recommended pattern from the Kilo community — a balanced, multi-dimensional reviewer:

```
You are a senior software engineer conducting thorough code reviews.

## Mandatory Checks (highest priority)
1. SECURITY: Flag SQL injection, XSS, hardcoded secrets, authorization gaps, and path traversal. Every input is untrusted.
2. CORRECTNESS: Identify logic errors, off-by-one bugs, race conditions, and missiing edge cases.
3. PERFORMANCE: Flag N+1 queries, synchronous I/O in request handlers, unnecessary allocations, and loop inefficiencies.

## Style & Conventions
- Follow the existing codebase's naming conventions (check surrounding files for patterns).
- Flag violations of the project's established patterns before suggesting alternatives.
- Prefer clarity over cleverness. Code is read more often than written.

## Testing
- Flag missing tests for new logic paths.
- Flag tests that only test the happy path without error cases.
- Flag assertions that are too broad or tautological.

## Feedback Tone
- Be specific and actionable. Every issue must include a suggested fix or explanation.
- Use severity labels: CRITICAL, WARNING, SUGGESTION, PRAISE.
- Always acknowledge what the PR does well alongside what needs improvement.
- If uncertain about a pattern, flag it as a question rather than an accusation.
```

**Source**: Kilo Code Reviews official docs + community consensus from the Custom Modes gallery (`Kilo-Org/kilocode/discussions/1671`).

---

### 2b. Security-First Reviewer (For security-critical PRs)

Based on the "Strict" review style approach, optimized for maximum security coverage:

```
You are a security-focused code reviewer. Functionality is secondary to safety.

## Security Rules (enforced)
- NO raw string concatenation in SQL queries. Flag every instance as CRITICAL.
- NO hardcoded API keys, tokens, passwords, or secrets in source code. Flag as CRITICAL.
- NO authorization bypass paths. Verify every endpoint checks the authenticated user's permissions.
- NO user-controlled data in file paths without sanitization (path traversal).
- NO eval() or dynamic code execution with user input.
- NO sensitive data in logs, error messages, or URLs.

## Authorization Pattern
- Every mutation endpoint MUST verify the requesting user owns or has permission for the target resource.
- Flag endpoints where authorization is done in a separate call from the mutation (TOCTOU race condition).

## Output Format
CRITICAL: [one-line summary]
  - Location: [file:line]
  - Impact: [what an attacker could do]
  - Fix: [specific code suggestion]
```

**Source**: Derived from Kilo's official blog post testing 3 frontier models (Jan 2026) — security was the #1 detection gap across all models.

---

### 2c. Codebase-Aware Reviewer (For monorepos / large projects)

Based on the per-directory `AGENTS.md` pattern:

```
You are reviewing code in the [{SUBDIRECTORY_NAME}] module of this project.

## Module-Specific Rules
- {module_name} has specific conventions documented in {path/to/CONVENTIONS.md}. Check those first.
- External dependencies from {module_name} must go through the module's public API only.
- Do NOT import internal modules directly; use the shared interface layer.

## Cross-Cutting Concerns
- Verify changes don't break the public API contract.
- Flag PRs that modify shared types without updating all consumers.
- Flag PRs that add dependencies without team discussion.

## Project Priorities
1. Backward compatibility
2. Test coverage in changed areas
3. Documentation for new public APIs
4. Performance regression benchmarks
```

**Source**: Kilo Code Custom Instructions documentation — per-directory AGENTS.md and instructions key in kilo.jsonc.

---

### 2d. Code Skeptic Mode (For catching agent-written code issues)

Adapted from the community's most popular custom mode (by `cau1k`, praised by `prmichaelsen` in Jan 2026):

```
You are a SKEPTICAL code quality inspector who questions everything.

## NEVER ACCEPT "IT WORKS" WITHOUT PROOF
- If the PR description says "it builds", verify build artifacts aren't present.
- If the PR says "tests pass", check that tests actually cover the changed code.
- If the PR claims a fix, verify the fix actually addresses the root cause, not just a symptom.

## CATCH SHORTCUTS AND LAZINESS
- Flag simplified implementations that skip proper error handling.
- Flag "temporary" solutions that are likely to become permanent.
- Flag code that ignores existing project patterns or conventions.
- Flag TODO comments, commented-out code, and magic numbers.

## DEMAND INCREMENTAL IMPROVEMENTS
- Challenge large PRs that should be broken into smaller changes.
- Insist on proper logging and observability for new code paths.
- Require verification that error states are handled, not just happy paths.

## REPORTING FORMAT
- FAILURES: What the PR claims vs what the code actually does
- SKIPPED: Error handling, edge cases, or documentation that's missing
- UNVERIFIED: Claims made without supporting evidence in the diff
- VIOLATIONS: Project rules that were broken

Your motto: "Show me the test or it didn't happen."
```

**Source**: Kilo-Org/kilocode discussion #1671, "Code Skeptic" mode — highly rated by the community (Jan 2026).

---

## 3. Model Selection Strategy for Reviews

Based on Kilo's published benchmark (Jan 2026, testing against 18 planted issues in a TypeScript API PR):

| Model | Issues Found | Security Detection | Best For | Cost |
|---|---|---|---|---|
| **GPT-5.2** | 13 (72%) | 100% | Deep audits, pre-release reviews | $$$ |
| **Claude Opus 4.5** | 8 (44%) | 100% | Speed + security (1 min reviews) | $$ |
| **Gemini 3 Pro** | 9 (50%) | 80% | Performance pattern detection | $ |
| **Grok Code Fast 1 (FREE)** | 8 (44%) | 100% | Daily security screening | FREE |

**Key finding**: Free models (Grok Code Fast 1) matched frontier models on catching SQL injection, path traversal, and missing authorization. The gap was in performance patterns (N+1 queries) and deeper authorization analysis. For most teams, the free tier is sufficient for day-to-day reviews.

**Recommendation**: Pair a free model for automatic PR reviews with a frontier model (GPT-5.2 or Claude Opus 4.5) for pre-release security audits.

---

## 4. Configuration Best Practices

### 4a. Setting Up Custom Instructions in Cloud Code Reviewer

1. Go to `app.kilo.ai/profile` → Code Reviews
2. Enable AI Code Review
3. Choose your model
4. Set Review Style (start with Balanced, move to Strict for critical repos)
5. Enable Focus Areas: Security + Bugs + Performance (minimum)
6. Paste your Custom Instructions in the text area
7. Set Max Review Time: 10 minutes (tested to be sufficient, even for frontier models)

### 4b. Combining Cloud + Local Reviews

- **Cloud Reviewer**: Automatic PR comments on GitHub/GitLab
- **Local Reviewer**: `/local-review` (branch vs base) and `/local-review-uncommitted` in IDE
- **Per-agent Custom Instructions**: Different prompts for cloud vs local reviews
  - Cloud: Focus on security and correctness (visible to team)
  - Local: Focus on style and refactoring suggestions (private before pushing)

### 4c. Per-Directory Instructions for Monorepos

Place `AGENTS.md` files in subdirectories to provide context-specific review guidance:

```
project-root/
├── AGENTS.md                    # Global review rules
├── packages/
│   ├── api/
│   │   ├── AGENTS.md           # API-specific conventions
│   │   └── src/
│   └── web/
│       ├── AGENTS.md           # Frontend-specific conventions
│       └── src/
```

This approach was confirmed in the Kilo Docs as the recommended pattern for monorepo projects.

---

## 5. Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | Better Approach |
|---|---|---|
| One giant instruction block | Model loses focus on priorities | Separate concerns: security vs style vs performance |
| Vague goals ("be thorough") | No actionable guidance | Use severity labels and specific patterns |
| Over-constraining style | Model misses real bugs chasing formatting | Let built-in linters handle formatting; focus the reviewer on logic |
| No model-specific tuning | Different models have different strengths | Pair free model (security) + frontier (depth) |
| Ignoring the Balanced style | Strict produces noise; Lenient misses issues | Start Balanced, add custom rules selectively |

**Key insight from Kilo's testing**: The Balanced review style with Security + Bugs + Performance focus areas caught 44% of planted issues with free models and 72% with GPT-5.2. The Lenient style was not benchmarked, but community feedback suggests it's too permissive for production code.

---

## 6. Recommended Quick-Start Configuration

For a team adopting Kilo Code Reviews in 2026:

### Step 1: Cloud Reviewer Setup (5 minutes)
```yaml
Model: Claude Opus 4.5 (for speed) or Grok Code Fast 1 (for free)
Review Style: Balanced
Focus Areas: Security, Bugs, Performance
Max Review Time: 10 minutes
Custom Instructions: [Use template 2a above]
```

### Step 2: Local Reviewer Setup
```yaml
Slash commands: /local-review and /local-review-uncommitted
Per-agent prompt: [Use template 2d — Code Skeptic — for pre-commit reviews]
```

### Step 3: Project AGENTS.md
```markdown
# Code Review Rules
- All PRs MUST pass Kilo Code Review before merging to main
- CRITICAL findings must be resolved before merge
- WARNING findings should be addressed or acknowledged
- The reviewer checks: security, correctness, performance, style, testing
```

### Step 4: Iterate Based on Feedback
- Review the first 10 PR reviews and refine custom instructions
- Add domain-specific rules (e.g., "Our API uses cursor-based pagination — flag offset-based pagination"")
- Remove rules that produce consistent false positives

---

## 7. Sources

1. **Kilo Code Docs - Code Reviews Overview** (`kilo.ai/docs/automate/code-reviews/overview`) — Official feature documentation with setup guide
2. **Kilo Code Docs - Custom Instructions** (`kilo.ai/docs/customize/custom-instructions`) — Instruction file discovery and layering
3. **Kilo Code Docs - Custom Modes** (`kilo.ai/docs/customize/custom-modes`) — Agent/mode configuration reference
4. **Kilo Code Docs - Prompt Engineering** (`kilo.ai/docs/customize/prompt-engineering`) — General prompt best practices
5. **"We Tested Three Frontier Models on Kilo's AI Code Reviews"** (Kilo Blog, Jan 13, 2026) — Benchmark data comparing GPT-5.2, Claude Opus 4.5, and Gemini 3 Pro
6. **Custom Kilo Code Modes Gallery** (GitHub Discussion #1671, Kilo-Org/kilocode) — Community-shared "Code Skeptic", "Code Review", "Code Simplifier" modes
7. **Kilo Code Reviewer Landing Page** (`kilo.ai/code-reviewer`) — Product page with feature descriptions
8. **Kilo Code Review 2026** (vibecoding.app, Mar 18, 2026) — Independent review covering orchestrator, pricing, and comparisons
9. **Kilo Code Review 2026** (computertech.co, Feb 2026) — Hands-on testing review
10. **Smart Code Review Assistant** (GitHub Discussion #1070, Kilo-Org/kilocode) — Feature request with proposed configuration schema
11. **Reddit r/kilocode: AMA - I Built Code Reviews in Kilo** — Developer insights on custom instructions purpose
12. **Kilo Code vs Roo Code vs Cline** (ai505.com, 2026) — Market comparison analysis

## Methodology
- Searched 10+ queries via Brave Search and Google
- Analyzed 12 sources via Kilo AI documentation, Kilo Blog, GitHub discussions, and independent reviews
- Cross-referenced community custom mode templates with official documentation
- Incorporated published benchmark data from Kilo's own frontier model testing (Jan 2026)
- Sub-questions investigated: custom instruction architecture, community-proven templates, model selection strategy, configuration layering, anti-patterns
