# Handoff — Tab Sorter Chrome Extension

**Date:** 2026-06-18
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
| Tests | ✅ 63 Vitest tests passing |

## Canonical design

Read the design spec: [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](superpowers/specs/2026-06-18-tab-sorter-extension-design.md).

One-line summary of the architecture: **pure logic** (`domain.ts`, `sort.ts`, `match.ts`, `export.ts`) is fully separated from a **single Chrome-API adapter** (`tabs-service.ts`), wired by shared `orchestration.ts`, with thin React entrypoints (popup, options) and a background worker (commands + context menu). `storage.ts` persists `Prefs` via `chrome.storage.sync`.

## How to build / run

```bash
cd apps/extension
bun run build      # → apps/extension/.output/chrome-mv3  (load unpacked in chrome://extensions)
bun run dev        # WXT dev server on port 5555 (HMR)
bun run test       # Vitest unit tests
bun run check-types # tsgo native type-check
bun run lint       # oxlint
bun run format     # oxfmt
bunx react-doctor@latest --yes --no-score --blocking error
```

Root scripts (`bun run dev|build|check-types|test|lint|format|format:check|check:doctor`) run across workspaces.

## Gotchas / environment notes

- **Bun workspaces:** root scripts use `bun run --workspaces --if-present <script>`.
- **tsgo:** type checking is performed by `@rslint/tsgo` (native/Go preview). The `typescript` package is retained for declaration files and editor language service support; `tsc` is no longer invoked directly.
- **oxfmt scope:** formats TS/TSX files under `apps/extension`. Generated files in `.output` and `.wxt` are ignored.
- **react-doctor:** configured via `doctor.config.json` (project: `apps/extension`). CI uses `--no-score` to avoid telemetry/network calls.
- **Windows + Git Bash:** Node reads `/tmp` as `C:\tmp`; use full `C:/Users/...` paths when scripting.
- No secrets or PII in this repo.

## Reference

- Spec: `docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`
- Better-T-Stack config: `bts.jsonc`
- WXT docs: https://wxt.dev
