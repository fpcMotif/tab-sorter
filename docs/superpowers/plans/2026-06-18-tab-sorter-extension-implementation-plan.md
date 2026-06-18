# Tab Sorter Extension Implementation Plan

- **Date:** 2026-06-18
- **Source spec:** `docs/superpowers/specs/2026-06-18-tab-sorter-extension-design.md`
- **Worktree:** `C:/Users/fenchem/tab-sorter-implementation`
- **Scope:** Implement the approved WXT/React Manifest V3 extension without re-opening locked product decisions.

## Ground Rules

- Work in `apps/extension/`; the repo root is only the npm workspace wrapper.
- Keep browser API usage isolated to `apps/extension/lib/tabs-service.ts`, `apps/extension/lib/storage.ts`, and WXT entrypoints.
- Build the pure logic test-first before wiring UI or background actions.
- Preserve the approved permissions: `tabs`, `storage`, `contextMenus`, `commands`; do not add `host_permissions` or `tabGroups`.
- Delete `apps/extension/entrypoints/content.ts`; the extension does not use content scripts.

## Phase 1: Test Harness And Shared Types

Create:

- `apps/extension/lib/types.ts`
- `apps/extension/lib/*.test.ts` test pattern
- any minimal Vitest setup needed by the WXT app

Define the shared contracts first:

- `TabLite`: `id`, `url`, `title`, `index`, `pinned`
- `SortMode`: `"title" | "domain"`
- `Prefs`: `defaultSort`, `ignorePinned`, `regexPresets`
- `RegexPreset`: `label`, `source`, `flags`

Acceptance checks:

- `npm run compile` from `apps/extension` passes.
- A trivial unit test can run from `apps/extension`.
- No Chrome globals are needed for pure logic tests.

## Phase 2: Pure Domain, Sort, And Match Logic

Implement in this order:

1. `apps/extension/lib/domain.ts`
   - `getDomain(url: string): string`
   - Strip leading `www.`
   - Bucket special schemes as stable labels such as `(chrome)`, `(about)`, `(file)`, and `(extension)`
   - Return a safe fallback for malformed or empty URLs

2. `apps/extension/lib/sort.ts`
   - `sortByTitle(tabs: TabLite[]): number[]`
   - `sortByDomain(tabs: TabLite[]): number[]`
   - Use `Intl.Collator` with numeric, case-insensitive comparison
   - Tie-break title sorts with URL, then original index

3. `apps/extension/lib/match.ts`
   - `groupByDomain(tabs: TabLite[]): Array<{ domain: string; count: number; tabIds: number[] }>`
   - `matchByDomain(tabs: TabLite[], domain: string): number[]`
   - `matchByRegex(tabs: TabLite[], source: string, flags?: string): number[]`
   - `InvalidPatternError` for invalid regular expressions
   - Regex target is `title + "\\n" + url`

Acceptance checks:

- Tests cover ordinary HTTP(S), `www.`, special schemes, malformed URLs, title sort tie-breaks, domain grouping, zero matches, and invalid regex.
- Pure modules do not import WXT, React, or Chrome/browser APIs.

## Phase 3: Storage And Chrome Tab Adapter

Create:

- `apps/extension/lib/storage.ts`
- `apps/extension/lib/tabs-service.ts`

`storage.ts` responsibilities:

- Export defaults for `Prefs`.
- Implement typed `getPrefs()` and `setPrefs()` over extension storage.
- Merge partial stored values with defaults so missing keys remain safe.

`tabs-service.ts` responsibilities:

- `getCurrentWindowTabs(): Promise<TabLite[]>`
- `applyOrder(orderedIds: number[], options?: { afterPinned?: number }): Promise<void>`
- `moveTabsToNewWindow(tabIds: number[]): Promise<void>`

Adapter behavior:

- Query only the current window for sort/extract operations.
- Convert browser tabs to `TabLite`, ignoring tabs without usable ids.
- Re-read current tabs before applying order so stale ids from closed tabs are ignored.
- Move unpinned sorted tabs after the pinned block.
- For extraction, create a new window with the first tab and move the rest into it.

Acceptance checks:

- Adapter tests use a Chrome/browser mock, not a real browser.
- Stale ids, empty arrays, and single-tab operations are no-ops.
- The adapter is the only non-entrypoint module that calls tab/window APIs.

## Phase 4: Shared Orchestration

Create `apps/extension/lib/orchestration.ts`.

Expose:

- `runSort(mode: SortMode): Promise<{ moved: number }>`
- `runExtract(matcher: { type: "domain"; domain: string } | { type: "regex"; source: string; flags?: string }): Promise<{ moved: number }>`
- optionally `getDomainGroups(): Promise<ReturnType<typeof groupByDomain>>` for popup rendering

Behavior:

- Read prefs once per action.
- Split pinned and unpinned tabs in one place.
- When `ignorePinned` is true, leave pinned tabs fixed and exclude them from extract.
- Call pure logic for ordering/matching and adapter functions for side effects.
- Return small result objects that UI/background code can turn into messages.

Acceptance checks:

- Tests cover pinned-tab exclusion, no-op results, sort mode dispatch, domain extract, regex extract, and invalid regex propagation.
- Popup and background entrypoints do not duplicate sort/match rules.

## Phase 5: Popup UI

Update files under `apps/extension/entrypoints/popup/`.

Required UI:

- Buttons for sorting by title and by domain.
- Domain list with counts and one-click extract.
- Regex/substring input with live match count.
- Inline error display for invalid regex.
- Preset chips loaded from prefs.
- Small status message for success, no matches, and errors.

Implementation notes:

- Keep React state local and simple.
- Load domain groups on popup mount and refresh after actions.
- Disable action buttons while an operation is running.
- Reuse orchestration functions; do not call Chrome APIs from React components.

Acceptance checks:

- Popup can sort, extract by domain, and extract by regex through orchestration.
- Invalid regex shows an inline error and does not move tabs.
- Empty/zero-match states are visible and non-crashing.

## Phase 6: Options Page

Add `apps/extension/entrypoints/options/`.

Required UI:

- Default sort mode selector.
- Ignore pinned tabs toggle.
- Regex preset manager with add/edit/delete.

Implementation notes:

- Use `getPrefs()` and `setPrefs()`.
- Validate preset label and regex source before saving.
- Keep saved presets as `{ label, source, flags }`.

Acceptance checks:

- Options persist through `chrome.storage.sync`.
- Popup sees updated presets after reopening.
- Invalid preset regex is rejected with a clear message.

## Phase 7: Background Commands, Context Menus, And Manifest

Update:

- `apps/extension/entrypoints/background.ts`
- `apps/extension/wxt.config.ts`
- remove `apps/extension/entrypoints/content.ts`

Manifest/config requirements:

- Add permissions: `tabs`, `storage`, `contextMenus`.
- Add commands: `sort-by-title`, `sort-by-domain`.
- Avoid `host_permissions`, content scripts, and `tabGroups`.

Background behavior:

- Register context menu items on install/startup.
- Commands call `runSort("title")` or `runSort("domain")`.
- Context menu actions include title sort, domain sort, and extract current site to a new window.
- Use the clicked tab URL to derive the current-site domain.

Acceptance checks:

- Background code imports orchestration and domain helpers only.
- Context menu creation is idempotent.
- Deleted content script no longer appears in the generated manifest.

## Phase 8: Verification And Manual E2E

Run from `apps/extension`:

1. `npm run compile`
2. unit tests
3. `npm run build`

Manual checklist using `apps/extension/.output/chrome-mv3`:

- Load unpacked extension in Chrome.
- Open mixed tabs with repeated domains, pinned tabs, special URLs, and ordinary HTTP(S) URLs.
- Sort by title from popup and command.
- Sort by domain from popup, command, and context menu.
- Extract by clicking a domain.
- Extract by regex/substring.
- Confirm pinned tabs stay fixed when `ignorePinned` is enabled.
- Confirm options persist default sort, pinned behavior, and regex presets.
- Confirm generated manifest has only the approved permissions.

## Suggested Execution Order For The Coding Agent

1. Add Vitest and pure module tests.
2. Implement `types.ts`, `domain.ts`, `sort.ts`, and `match.ts`.
3. Implement adapter/storage with mocks.
4. Implement orchestration and tests.
5. Replace popup UI.
6. Add options UI.
7. Wire background, commands, context menus, and WXT config.
8. Delete `content.ts`.
9. Run verification and update this plan if any intentional deviation is needed.
