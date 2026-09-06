# Handoff — Tab Sorter Chrome Extension

**Updated:** 2026-07-16
**Purpose:** Hand this project to a fresh agent (or another model) to continue the work — and to compare how different models pick it up.

## TL;DR

A Manifest V3 Chrome extension that **sorts the current window's tabs** (A→Z by title, or grouped by domain), **extracts tabs matching a domain or regex into a new window**, and **exports all tab URLs as Markdown or plain text**. Stack: **Better-T-Stack → WXT addon (React template)**, Manifest V3, TypeScript, Vite.

Implementation is **complete and tested**. The project now uses **Bun** as its package manager/runtime, **@rslint/tsgo** for native type checking, **oxc** (oxlint/oxfmt) for linting/formatting, **Vitest** for unit tests, and **react-doctor** for codebase health checks.

## Where things stand

| Phase | Status |
|-------|--------|
| Brainstorming / requirements | ✅ Done |
| Design spec | ✅ Written: [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](superpowers/specs/2026-06-18-tab-sorter-extension-design.md) |
| Scaffold (Better-T-Stack + WXT React) | ✅ Generated at `apps/extension/` |
| Core logic (`lib/`) | ✅ Implemented and unit-tested |
| UI entrypoints (popup, options, background) | ✅ Implemented |
| Tab URL export feature | ✅ Implemented |
| Tooling migration (bun + tsgo + oxc + react-doctor) | ✅ Done |
| CI / GitHub Actions | ✅ `.github/workflows/ci.yml` |
| Tests | ✅ 302 Vitest tests passing; 100% statement/branch/function/line coverage |

## Canonical design

Read [`CONTEXT.md`](../CONTEXT.md), ADRs
[`0002`](adr/0002-tabplan-realize.md)–[`0005`](adr/0005-single-writer-prefs.md), and the
[background mutation spec](superpowers/specs/2026-07-16-background-mutation-architecture.md).
The 2026-06-18 design spec records the original MVP.

One-line summary: pure planners emit `TabPlan`; `mutation.ts` owns the transaction and
per-window queue; private `mutation-realize.ts` owns browser effects; the background is the
sole mutation and Prefs writer. Popup/options send typed runtime requests.

## How to build / run

```bash
cd apps/extension
bun run build      # → apps/extension/.output/chrome-mv3  (load unpacked in chrome://extensions)
bun run dev        # WXT dev server on port 5555 (HMR)
bun run test       # Vitest unit tests
bun run check-types # tsgo native type-check
bun run lint       # oxlint
bun run format     # oxfmt
bun run check:doctor
```

Root scripts (`bun run dev|build|check-types|test|lint|format|format:check|check:doctor`) run across workspaces.

## Gotchas / environment notes

- **Bun workspaces:** root scripts use `bun run --filter='*' <script>`.
- **tsgo:** type checking is performed by `@rslint/tsgo` (native/Go preview). The `typescript` package is retained for declaration files and editor language service support; `tsc` is no longer invoked directly.
- **oxfmt scope:** formats TS/TSX files under `apps/extension`. Generated files in `.output` and `.wxt` are ignored.
- **react-doctor:** configured via `doctor.config.json`. The current score is 95/100. Its
  warning-blocking gate stays red on the two existing giant `App` components.
- **Windows + Git Bash:** Node reads `/tmp` as `C:\tmp`; use full `C:/Users/...` paths when scripting.
- No secrets or PII in this repo.

## Reference

- Current architecture: `CONTEXT.md`, ADRs `0002`–`0005`
- Original MVP spec: `docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`
- Better-T-Stack config: `bts.jsonc`
- WXT docs: https://wxt.dev
