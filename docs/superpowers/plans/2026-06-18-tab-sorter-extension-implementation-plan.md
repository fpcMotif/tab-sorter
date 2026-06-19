# Tab Sorter Extension Implementation Plan

- **Date:** 2026-06-18
- **Source spec:** [`docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`](../specs/2026-06-18-tab-sorter-extension-design.md)
- **Worktree:** `C:/Users/fenchem/tab-sorter-implementation-work`
- **Branch:** `implement-tab-sorter-extension`
- **Scope:** Implement the approved WXT/React Manifest V3 extension without re-opening locked product decisions.

## Ground rules

- Work in `apps/extension/`; the repo root is only the npm workspace wrapper.
- Do **not** re-derive or alter the six locked decisions in the spec (React UI, move-to-new-window extract, current-window scope, two sort modes, domain list + regex input, full entrypoint set).
- Keep browser API usage isolated to `apps/extension/lib/tabs-service.ts`, `apps/extension/lib/storage.ts`, and WXT entrypoints.
- Build pure logic **test-first** (`superpowers:test-driven-development`) before wiring UI or background actions.
- Preserve approved permissions: `tabs`, `storage`, `contextMenus`, `commands`. Do **not** add `host_permissions`, content scripts, or `tabGroups`.
- Delete `apps/extension/entrypoints/content.ts` during implementation (design uses no content scripts).

## Build / verify commands

Run from `apps/extension/` unless noted:

| Command | Purpose |
|---------|---------|
| `npm run compile` | `tsc --noEmit` type check |
| `npm test` | Vitest unit tests (add in Phase 0) |
| `npm run build` | WXT build → `apps/extension/.output/chrome-mv3` |
| `npm run dev` | WXT dev server on port 5555 (HMR) |
| `npm run build` (repo root) | Builds all workspaces |
| `npm run check-types` (repo root) | Type-check all workspaces |

Manual E2E: load unpacked from `apps/extension/.output/chrome-mv3` in `chrome://extensions`.

**Environment gotchas** (from handoff): stray `C:\Users\fenchem\node_modules` can poison Vite dep-optimization; if `wxt dev` misbehaves, check that first. Use `npm approve-scripts` if native-binary postinstall errors appear.

---

## Phase 0 — Vitest harness

**Goal:** A failing test can run in `apps/extension` before any production code.

**Steps:**

1. Add dev deps: `vitest`, `@webext-core/fake-browser` (for adapter tests later).
2. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `apps/extension/package.json`.
3. Add `apps/extension/vitest.config.ts` (or inline config in `package.json`) resolving `@/` to the WXT app root.
4. Add a smoke test (e.g. `apps/extension/lib/smoke.test.ts`) that asserts `true` — proves the runner works.

**Acceptance:**

- `npm test` passes from `apps/extension/`.
- `npm run compile` still passes.
- Pure-logic tests do not require a real browser or Chrome global.

---

## Phase 1 — Shared types (`lib/types.ts`)

**Goal:** Lock data contracts before behavior.

**TDD:**

1. **Red:** Add `apps/extension/lib/types.test.ts` importing types and asserting sample objects satisfy `TabLite`, `SortMode`, `Prefs`, `RegexPreset`.
2. **Green:** Create `apps/extension/lib/types.ts` with:
   - `TabLite`: `id`, `url`, `title`, `index`, `pinned`
   - `SortMode`: `'title' | 'domain'`
   - `Prefs`: `defaultSort`, `ignorePinned`, `regexPresets`
   - `RegexPreset`: `label`, `source`, `flags`
3. **Refactor:** Export defaults helper for `Prefs` if useful for storage (optional constant `DEFAULT_PREFS`).

**Acceptance:**

- `npm test` and `npm run compile` pass.
- No `chrome.*` / `browser.*` imports in `types.ts`.

---

## Phase 2 — Pure `domain.ts`

**Goal:** Stable domain bucketing for sort, grouping, and extract.

**TDD (one behavior per test, then implement):**

1. **Red:** Tests in `apps/extension/lib/domain.test.ts` for:
   - `https://www.github.com/foo` → `github.com`
   - `http://WWW.Example.com` → `example.com` (case-insensitive host)
   - `chrome://settings`, `about:blank`, `file:///tmp/x`, extension pages → stable `(scheme)` buckets per spec
   - Malformed / empty URL → safe fallback (no throw)
2. **Green:** Implement `getDomain(url: string): string` in `apps/extension/lib/domain.ts`.
3. **Refactor:** Extract scheme-bucket map if repetitive; keep function pure.

**Acceptance:**

- All domain tests pass; module has zero side effects.

---

## Phase 3 — Pure `sort.ts`

**Goal:** Deterministic tab-id orderings.

**TDD:**

1. **Red:** `apps/extension/lib/sort.test.ts` with fixture `TabLite[]` arrays covering:
   - Title sort A→Z with `Intl.Collator({ numeric: true, sensitivity: 'base' })`
   - Title tie-break: same title → URL; same URL → stable by original index
   - Domain sort: domains A→Z, then title sort within each domain
   - Empty / single-tab arrays
   - Already-sorted input (still returns valid order)
2. **Green:** Implement `sortByTitle(tabs): number[]` and `sortByDomain(tabs): number[]` in `apps/extension/lib/sort.ts` (uses `getDomain`).
3. **Refactor:** Shared collator instance if needed.

**Acceptance:**

- Sort tests pass; no Chrome/React/WXT imports.

---

## Phase 4 — Pure `match.ts`

**Goal:** Domain grouping and extract matching.

**TDD:**

1. **Red:** `apps/extension/lib/match.test.ts` for:
   - `groupByDomain`: count desc, then domain name; correct `tabIds`
   - `matchByDomain`: exact domain match
   - `matchByRegex`: matches against `title + '\n' + url`
   - Invalid regex throws `InvalidPatternError` (export class from this module)
   - Zero-match cases return `[]`
2. **Green:** Implement `groupByDomain`, `matchByDomain`, `matchByRegex` in `apps/extension/lib/match.ts`.
3. **Refactor:** Ensure `InvalidPatternError` is distinguishable for popup inline errors.

**Acceptance:**

- Match tests pass; regex invalid-pattern behavior matches spec §9.

---

## Phase 5 — Storage adapter (`lib/storage.ts`)

**Goal:** Typed prefs over `chrome.storage.sync` with safe defaults.

**TDD:**

1. **Red:** `apps/extension/lib/storage.test.ts` using `@webext-core/fake-browser` (or equivalent mock):
   - `getPrefs()` returns defaults when storage empty
   - `setPrefs()` merges partial updates
   - Stored values round-trip
2. **Green:** Implement `getPrefs()` / `setPrefs()` and `DEFAULT_PREFS` in `apps/extension/lib/storage.ts`.
3. **Refactor:** Keep this the **only** module that calls storage APIs.

**Acceptance:**

- Adapter tests pass with mocked browser global.
- Defaults: `defaultSort: 'title'`, `ignorePinned: true`, `regexPresets: []`.

---

## Phase 6 — Tabs adapter (`lib/tabs-service.ts`)

**Goal:** Thin Chrome tabs/windows wrapper.

**TDD:**

1. **Red:** `apps/extension/lib/tabs-service.test.ts` with fake browser:
   - `getCurrentWindowTabs()` queries `{ currentWindow: true }`, maps to `TabLite`, drops tabs without ids
   - `applyOrder(orderedIds, { afterPinned })` re-queries before moves; ignores stale ids; places unpinned order after pinned block
   - `moveTabsToNewWindow(tabIds)` creates window with first tab, moves rest to `index: -1`; no-op on 0–1 ids
   - Empty ordered list is no-op
2. **Green:** Implement the three functions in `apps/extension/lib/tabs-service.ts`.
3. **Refactor:** Confirm this is the **only** non-entrypoint module calling tab/window APIs.

**Acceptance:**

- Adapter tests pass; stale-id and empty-input edge cases covered (spec §9).

---

## Phase 7 — Orchestration (`lib/orchestration.ts`)

**Goal:** Single place for pinned split + sort/extract flows (shared by popup, background, context menu).

**TDD:**

1. **Red:** `apps/extension/lib/orchestration.test.ts` mocking `tabs-service` and `storage`:
   - `runSort('title' | 'domain')` splits pinned/unpinned once; honors `ignorePinned`
   - `runExtract({ type: 'domain', domain })` and `{ type: 'regex', source, flags? }`
   - Invalid regex propagates `InvalidPatternError`
   - Zero matches / no-op sort returns `{ moved: 0 }` (or equivalent small result)
   - Optional: `getDomainGroups()` wraps `groupByDomain` on current tabs for popup
2. **Green:** Implement `runSort`, `runExtract`, and optional `getDomainGroups` in `apps/extension/lib/orchestration.ts`.
3. **Refactor:** No duplicated pinned logic in entrypoints.

**Acceptance:**

- Orchestration tests pass; entrypoints will only call these functions for actions.

---

## Phase 8 — Popup UI (`entrypoints/popup/`)

**Goal:** Replace scaffold React popup with spec UI.

**Steps (UI after lib is green):**

1. Rebuild `App.tsx` (+ styles as needed): sort-by-title / sort-by-domain buttons.
2. On mount: load domain groups via orchestration helper; show `{ domain, count }` list with one-click extract.
3. Regex/substring input with **live match count** preview (call pure `matchByRegex` on current tab snapshot or orchestration helper).
4. Preset chips from `getPrefs().regexPresets`.
5. Inline red error for invalid regex; status toasts for success, no matches, no-op.
6. Disable buttons while async operations run; close popup after successful extract (spec §6).

**Acceptance:**

- Popup actions go through orchestration only (no direct `chrome.*` in React).
- Manual smoke: sort + extract from popup after `npm run build`.

---

## Phase 9 — Options page (`entrypoints/options/`)

**Goal:** Persist user prefs and regex presets.

**Steps:**

1. Add WXT options entrypoint: `entrypoints/options/` (`index.html`, `main.tsx`, `App.tsx`, styles).
2. UI: default sort selector, ignore-pinned toggle, regex preset add/edit/delete.
3. Validate preset label + regex source before save (reject invalid patterns with message).
4. Wire `getPrefs()` / `setPrefs()`.

**Acceptance:**

- Options persist via `chrome.storage.sync`.
- Popup reflects updated presets after reopen.

---

## Phase 10 — Background, manifest, cleanup

**Goal:** Commands + context menu; approved manifest; remove content script.

**Steps:**

1. Update `apps/extension/wxt.config.ts`:
   - Permissions: `tabs`, `storage`, `contextMenus`, `commands`
   - Commands: `sort-by-title` (suggested `Alt+Shift+T`), `sort-by-domain` (suggested `Alt+Shift+D`)
   - No `host_permissions`, no content scripts
2. Rewrite `apps/extension/entrypoints/background.ts`:
   - Register context menus on install/startup (idempotent)
   - Page context: "Sort tabs A→Z", "Sort tabs by domain", "Extract this site (`<domain>`) → new window"
   - Command listeners call `runSort('title')` / `runSort('domain')`
   - Context-menu extract uses clicked tab URL → `getDomain` → `runExtract({ type: 'domain', domain })`
   - Default-action hotkey uses `Prefs.defaultSort` where applicable
3. **Delete** `apps/extension/entrypoints/content.ts`.

**Acceptance:**

- `npm run build` succeeds; generated manifest in `.output/chrome-mv3` has only approved permissions and no content scripts.
- Background imports orchestration + domain helpers only.

---

## Phase 11 — Verification (`superpowers:verification-before-completion`)

**Automated (from `apps/extension/`):**

1. `npm test`
2. `npm run compile`
3. `npm run build`

**Manual E2E checklist** (load `apps/extension/.output/chrome-mv3`):

- [ ] Mixed tabs: repeated domains, pinned tabs, `chrome://` / `file://` / extension pages, ordinary HTTPS
- [ ] Sort by title: popup + keyboard command
- [ ] Sort by domain: popup + command + context menu
- [ ] Extract by domain click
- [ ] Extract by regex/substring; invalid regex shows inline error, no move
- [ ] Zero matches shows notice; no empty window created
- [ ] Pinned tabs stay fixed when `ignorePinned` is true; excluded from extract
- [ ] Options persist default sort, pinned behavior, regex presets
- [ ] Manifest permissions match spec §4

---

## Suggested execution order for the coding agent

Execute phases **0 → 11** in order. Within Phases 2–7, always **write failing test → minimal implementation → refactor** before moving to the next module.

Invoke `superpowers:executing-plans` or `superpowers:subagent-driven-development` to run this plan phase-by-phase.

If an intentional deviation from the spec is required during implementation, document it in this file under a **Deviations** section — do not silently change locked decisions.

## Module map (reference)

```
apps/extension/lib/
├── types.ts
├── domain.ts          + domain.test.ts
├── sort.ts            + sort.test.ts
├── match.ts           + match.test.ts
├── storage.ts         + storage.test.ts
├── tabs-service.ts    + tabs-service.test.ts
└── orchestration.ts   + orchestration.test.ts
```

Entrypoints: `popup/`, `options/`, `background.ts` — thin glue only.
