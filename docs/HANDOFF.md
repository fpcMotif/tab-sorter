# Handoff — Tab Sorter Chrome Extension

**Date:** 2026-06-18
**Purpose:** Hand this project to a fresh agent (or another model) to continue the work — and to compare how different models pick it up.

## TL;DR

A Manifest V3 Chrome extension that **sorts the current window's tabs** (A→Z by title, or grouped by domain) and **extracts tabs matching a domain or regex into a new window**. Stack: **Better-T-Stack → WXT addon (React template)**, TypeScript, Vite, MV3.

Brainstorming and design are **done and approved**. The project is **scaffolded and verified building**. **Implementation has not started.**

## Where things stand

| Phase | Status |
|-------|--------|
| Brainstorming / requirements | ✅ Done (6 decisions locked — see spec) |
| Design spec | ✅ Written: [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](superpowers/specs/2026-06-18-tab-sorter-extension-design.md) |
| Scaffold (Better-T-Stack + WXT React) | ✅ Generated at `apps/extension/`, `npm install` + `npm run build` verified |
| Implementation plan | ⬜ Not started → next step |
| Implementation (lib + entrypoints) | ⬜ Not started |
| Tests | ⬜ Not started |

## Canonical design

**Do not re-derive the design** — read the spec: [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](superpowers/specs/2026-06-18-tab-sorter-extension-design.md).
It contains the 6 locked decisions, architecture (with Mermaid diagrams), module breakdown, data flows, permissions, edge cases, and testing plan.

One-line summary of the architecture: **pure logic** (`domain.ts`, `sort.ts`, `match.ts`) is fully separated from a **single Chrome-API adapter** (`tabs-service.ts`), wired by a shared `orchestration.ts`, with thin React entrypoints (popup, options) and a background worker (commands + context menu).

## Next steps (in order)

1. **Create the implementation plan** with the `superpowers:writing-plans` skill, driven by the spec above.
2. Build `apps/extension/lib/` **test-first** (`superpowers:test-driven-development`): `types.ts` → `domain.ts` → `sort.ts` → `match.ts` (pure, Vitest) → `tabs-service.ts` / `storage.ts` (mock `chrome.*`) → `orchestration.ts`.
3. Wire entrypoints: rebuild `popup/App.tsx`, add `options/` page, implement `background.ts` (commands + context menu).
4. **Delete** the placeholder `apps/extension/entrypoints/content.ts` — the design uses no content scripts.
5. Add `tabs`, `storage`, `contextMenus`, `commands` to the manifest in `wxt.config.ts` (no `host_permissions`, no `tabGroups`).
6. Manual E2E: load unpacked from `apps/extension/.output/chrome-mv3`.

## How to build / run

```bash
cd apps/extension
npm run build      # → apps/extension/.output/chrome-mv3  (load unpacked in chrome://extensions)
npm run dev        # WXT dev server on port 5555 (HMR)
npm run compile    # tsc --noEmit type check
```
(Root scripts `npm run dev|build|check-types` run across workspaces.)

## Gotchas / environment notes

- **Stray `~/node_modules`:** `C:\Users\fenchem\node_modules` exists and is known to poison Vite dep-optimization in subprojects on this machine. `wxt build` worked fine, but if `wxt dev` misbehaves, this is the first suspect.
- **npm allow-scripts:** install gated `esbuild` / `spawn-sync` postinstall scripts. The build still succeeded; if a native-binary error appears, run `npm approve-scripts` in the project.
- **Monorepo:** the extension is at `apps/extension/`, not the repo root. `bts.jsonc` records the exact Better-T-Stack config (safe to delete).
- **Windows + Git Bash:** Node reads `/tmp` as `C:\tmp`; use full `C:/Users/...` paths when scripting.
- No secrets or PII in this repo.

## Suggested skills (invoke these)

- `superpowers:writing-plans` — **next step**; turn the spec into an implementation plan.
- `superpowers:test-driven-development` — build the pure `lib/` modules red-green-refactor.
- `superpowers:executing-plans` or `superpowers:subagent-driven-development` — to execute the plan.
- `superpowers:verification-before-completion` — before declaring done.

## Reference

- Spec: `docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`
- Better-T-Stack config: `bts.jsonc`
- WXT docs: https://wxt.dev
