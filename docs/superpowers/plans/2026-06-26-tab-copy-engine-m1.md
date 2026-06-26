# Tab Copy engine — M1 Implementation Plan

> **REQUIRED SUB-SKILL:** Execute this plan with `superpowers:subagent-driven-development` (or `superpowers:executing-plans` for a single-session run). Each task-block A..M is a checkbox step; dispatch one subagent per block in dependency order, verify its tests green before checking the box, and never start a block whose upstream exports are not yet landed.

**Goal:** Port the donor Tab Copy engine into `tab-sorter` as a pure render core behind a Sink seam, delivering a usable popup that copies the selected scope in the selected format to the clipboard.

**Architecture:** A pure-logic core in `lib/copy/` gathers tabs by scope, resolves a configured format, and walks the selection to produce a scope-discriminated `CopyPayload` (rendered text/HTML plus structured `TabRecord[]`). A one-method `Sink` seam (`consume(payload)`) decouples *what content* from *where it goes*; M1 ships the clipboard and file-download sinks. The popup uses the focusable `navigator.clipboard.write([ClipboardItem])` path; the background/offscreen path is deferred to M2.

**Tech Stack:** TypeScript (sound type design, `defineFormat<O>` opts inference), WXT (MV3), React (Soft Editorial popup), Vitest (byte-exact golden parity tests), Bun (toolchain/runtime).

---

## File structure

### Pure logic (`lib/copy/`, fully unit-tested)

| File | Responsibility | Module |
|---|---|---|
| `lib/copy/types.ts` | Canonical copy types: `ScopeId`, `SCOPE_IDS`, `isTabScopeId`, `TabLite`, `WindowLite`, `ScopeSnapshot`, `ScopeSelection`, `TabRecord`, `Rendered`, `CopyPayload` | A |
| `lib/copy/string.ts` | `sentenceCase`, `indent`, `encodeHtml` shared helpers (own module to avoid format↔template coupling) | B |
| `lib/copy/csv.ts` | `stringifyCSVRow`, `stringifyCSVRows` CSV quoting | B |
| `lib/copy/scope.ts` | `selectScope(snapshot, scopeId, includePinned)` with per-scope filter divergence (highlighted bypasses pinned filter), empty-window drop, tab-flat vs window-grouped selection | C |
| `lib/copy/format.ts` | Registry via `defineFormat`; `Format`/`FormatId`/`BuiltinFormatId`/`CustomFormatId`/`FormatOpts`; `getFormat`, `isFormatId`, `isCustomFormatId`, `parseIndent`, `MAX_INDENT_SIZE`; per-format text/html transforms, default opts, `isInvalid` | D |
| `lib/copy/configured-format.ts` | `ConfiguredFormat`; `resolveConfiguredFormat(format, storedOpts, getFormatById)` whole-object opts overlay + link-fallback recursion guard | E |
| `lib/copy/template.ts` | `TEMPLATE_FIELDS`, `getFieldTokens`, `interpolate`; 7 fields, per-field token allow-lists, literal-survival, injected `Clock`+`parseUrl` (`TokenValueSources`) | F |
| `lib/copy/render.ts` | `render(selection, format)` assembly walk; `start`/`windowStart`/`tab`/`tabDelimiter`/`windowEnd`/`windowDelimiter`/`end`; `globalSeq`/`windowSeq`/`windowTabSeq`; empty-selection-still-renders | G |
| `lib/copy/entries.ts` | `buildEntries(selection)` → `TabRecord[]`; `buildPayload(selection, rendered?)` → scope-discriminated `CopyPayload` (+ `windows[]`) | H |

### Adapters (`lib/`)

| File | Responsibility | Module |
|---|---|---|
| `lib/tabs-service.ts` *(extend)* | `getScopeSnapshot()` via `tabs.query(highlighted)` + `windows.getAll({populate:true})`; `toTabLite` adds `favIconUrl`, `highlighted` | K |
| `lib/types.ts` *(extend)* | Add `favIconUrl?` and `highlighted?` to existing `TabLite` | K |
| `lib/sinks/sink.ts` | `Sink` interface: `consume(payload: CopyPayload): Promise<void>` | I |
| `lib/sinks/clipboard-sink.ts` | `ClipboardSink` — writes `payload.rendered` via the navigator clipboard path | I |
| `lib/sinks/file-download-sink.ts` | `FileSink(formatId, deps?)`, `FileSinkDeps`, `TriggerDownload`; refactor of `export.ts` | I |
| `lib/sinks/file-meta.ts` | `deriveFileMeta(id, tabCount)` → `FileMeta { filename, extension, mimeType }` | I |
| `lib/clipboard/clipboard-item.ts` | `ClipboardPart`, `buildClipboardItem(rendered)` — pure mime-map build | J |
| `lib/clipboard/navigator-clipboard.ts` | `writeToClipboard(rendered)` — popup-path `navigator.clipboard.write` adapter (sole owner: J; sequence J before I per reconciliation 3) | J |
| `lib/orchestration.ts` *(extend)* | `runCopy(scopeId, formatId, sink)` → `{ count }`; `getCopyPopupData()` → `CopyPopupData` (scopes w/ live counts, visible formats, default) | L |

### Entrypoints

| File | Responsibility | Module |
|---|---|---|
| `entrypoints/popup/` *(extend)* | React Copy popup (Soft Editorial): 2×2 scope tiles w/ count badges, format list w/ Default pill, sage Copy action; consumes `getCopyPopupData`, calls `runCopy` | M |

## Cross-module reconciliations — apply while executing

This plan was authored one module at a time, then consistency-checked. Honor these cross-cutting fixes so the pieces line up (the producer module owns each shared symbol):

1. **L vs M** — Make L the sole owner of getCopyPopupData/CopyPopupData and adopt M's richer view shape: CopyScopeView {id, label, count} and CopyFormatView {id, label, description?, isDefault}. L computes label/description/isDefault from getFormat + scope catalog so the popup (M) needs no second registry lookup. Remove the getCopyPopupData/CopyPopupData declarations from M's export list (M only consumes them).
2. **L (symbol table) vs spec §4.5 vs CONTRACTS** — Use the 3-param CONTRACTS signature for M1 (popup is the only trigger). Defer the `trigger` parameter to M2 when background/offscreen surfaces add a second write-path; note the planned signature change in the M2 milestone rather than the M1 block.
3. **I vs J** — J is the single owner of lib/clipboard/navigator-clipboard.ts and its writeToClipboard. Sequence J before I (or have I depend on J directly). Drop the 'stub if not present' clause; ClipboardSink (I) imports writeToClipboard from J. clipboard-item.ts buildClipboardItem (J) feeds writeToClipboard.
4. **D (symbol table) vs CONTRACTS** — Standardize on getFormat(id: FormatId): Format<any> (the CONTRACTS form) so D's export and E's getFormatById parameter are assignable. Keep the soundness note (branch on isCustomFormatId, no donor `as` cast).
5. **F (TokenValueSources) vs CONTRACTS (template injection)** — Confirm the seam: interpolate(fieldId, template, sources) takes pre-resolved values (now, parsedUrl) in TokenValueSources, and the Clock/parseUrl injection lives one level up in render.ts (G) / configured-format where TokenValueSources is assembled. Document that render owns the Clock+parseUrl dependency injection so template.ts stays pure; deviation #5 (malformed-URL → empty) is handled by passing parsedUrl: null.
6. **A (ScopeSelection) vs G/H consumers** — Confirm seqs are engine-computed in render/entries (not in selectScope), consistent with TabRecord comment '// engine-computed'. No type change needed, but the plan must state that G and H independently assign matching windowSeq/windowTabSeq/globalSeq so rendered text and entries[] stay in lockstep (single shared numbering helper to avoid drift).

**Coverage notes (fold into the named tasks):**

- Manifest/permission deltas (spec §3, §4.3, §10: offscreen, clipboardWrite, minimum_chrome_version: 116) are NOT in any M1 block. This is correct for M1 (popup path needs none of these), but the plan header must state explicitly that the M1 popup uses navigator.clipboard with no manifest change, so a reviewer does not flag it as missing — it lands in M2.
- Deviation #7 (export.ts domain-grouped Markdown demoted; donor-parity Markdown canonical) is claimed by I but the mechanism is under-specified: refactoring export.ts behind FileSink must preserve or migrate the existing extension's current export behavior/tests. The plan should name which existing export.ts tests change and confirm the demoted domain-grouped Markdown is not silently dropped (it becomes a future format opt, not deleted).
- favIconUrl provenance for TabRecord: K adds favIconUrl to TabLite via toTabLite, and §4.2 names TabRecord.favIconUrl as sourced from it, but no block states that entries.ts (H) copies TabLite.favIconUrl → TabRecord.favIconUrl. Add that mapping to H's responsibilities so the favicon present/absent golden tests (§8) have a data path.
- Live scope counts for the popup (§6: 'live count badges'): L's getCopyPopupData must compute per-scope counts by running selectScope for each ScopeId against one snapshot. This is implied but not called out; the plan should specify that getCopyPopupData fans the single ScopeSnapshot through selectScope×4 (respecting includePinned default true, deviation #2) to fill CopyScopeView.count, so M1's count badges are correct.
- Fixed synthetic fixture dataset (§8: untitled tab, about:/chrome: URL, pinned, favicon present/absent, bracket/paren titles, empty selection, single/multi-window) is the backbone of every parity test but is not assigned to a block. Assign the shared fixture file (e.g. lib/copy/__fixtures__/tabs.ts) to block A (it depends only on the A types) so D/G/H golden tests can all import it.

---

## Tasks

### Task A: Shared copy types (`lib/copy/types.ts`)

Foundational module for the Tab Copy engine. Defines every shared type used across the copy pipeline (scopes, tab/window snapshots, scope selections, per-tab records, rendered output, copy payload) plus a `SCOPE_IDS` as-const catalog and an `isTabScopeId` type guard. Pure data only — no `chrome`, no React, no I/O. Strict TDD cycle below.

Notes for the implementer:
- Use the exact type names/shapes from the CONTRACTS block verbatim. Do not rename or add variant types.
- Imports in this repo use explicit `.ts` extensions and the `@/lib/...` alias; this module imports nothing, so only the test file has imports (relative `./types.ts`, matching the existing `lib/types.test.ts` style).
- `ScopeId` here is the copy engine's own 4-scope union and is intentionally separate from the legacy `lib/scope`/`lib/types.ts` `ScopeId` (those live in the sort feature). Keep them independent — do not import or merge.
- `isTabScopeId` mirrors the donor's `scope.ts` guard: `id !== 'all-windows-and-tabs'` is the single window-scope; the other three are tab scopes (donor `scope.ts` line 52-54: `isTabScopeId` returns `id !== 'all-windows-and-tabs'`).

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/types.test.ts` with the complete test code below.

```ts
import { describe, expect, it } from "vitest";

import {
  SCOPE_IDS,
  isTabScopeId,
  type CopyPayload,
  type Rendered,
  type ScopeId,
  type ScopeSelection,
  type ScopeSnapshot,
  type TabLite,
  type TabRecord,
  type WindowLite,
} from "./types.ts";

describe("copy scope ids", () => {
  it("lists the four canonical scope ids in order", () => {
    expect(SCOPE_IDS).toEqual([
      "highlighted-tabs",
      "window-tabs",
      "all-tabs",
      "all-windows-and-tabs",
    ]);
  });

  it("treats every scope except all-windows-and-tabs as a tab scope", () => {
    // Donor scope.ts: isTabScopeId === (id !== 'all-windows-and-tabs')
    expect(isTabScopeId("highlighted-tabs")).toBe(true);
    expect(isTabScopeId("window-tabs")).toBe(true);
    expect(isTabScopeId("all-tabs")).toBe(true);
    expect(isTabScopeId("all-windows-and-tabs")).toBe(false);
  });

  it("narrows a ScopeId via the guard", () => {
    const id: ScopeId = "window-tabs";
    if (isTabScopeId(id)) {
      // exclusion of the window scope is the whole point of the guard
      const narrowed: Exclude<ScopeId, "all-windows-and-tabs"> = id;
      expect(narrowed).toBe("window-tabs");
    } else {
      throw new Error("window-tabs must be a tab scope");
    }
  });
});

describe("copy data contracts", () => {
  it("accepts a minimal TabLite and its optional fields", () => {
    const minimal: TabLite = {
      id: 1,
      url: "https://example.com",
      title: "Example",
      index: 0,
      pinned: false,
    };
    const full: TabLite = {
      ...minimal,
      favIconUrl: "https://example.com/favicon.ico",
      highlighted: true,
    };

    expect(minimal.favIconUrl).toBeUndefined();
    expect(full.highlighted).toBe(true);
  });

  it("builds a ScopeSnapshot of windows with tabs", () => {
    const tab: TabLite = { id: 7, url: "https://a.test", title: "A", index: 0, pinned: false };
    const window: WindowLite = { id: 10, tabs: [tab] };
    const snapshot: ScopeSnapshot = {
      windows: [window],
      currentWindowId: 10,
      highlightedTabIds: [7],
    };

    expect(snapshot.windows[0]!.tabs[0]!.id).toBe(7);
    expect(snapshot.currentWindowId).toBe(10);
    expect(snapshot.highlightedTabIds).toEqual([7]);
  });

  it("discriminates ScopeSelection by scope", () => {
    const tab: TabLite = { id: 1, url: "https://a.test", title: "A", index: 0, pinned: false };
    const tabSel: ScopeSelection = { scope: "tab", tabs: [tab] };
    const windowSel: ScopeSelection = { scope: "window", windows: [{ id: 2, tabs: [tab] }] };

    expect(tabSel.scope === "tab" && tabSel.tabs.length).toBe(1);
    expect(windowSel.scope === "window" && windowSel.windows.length).toBe(1);
  });

  it("models a TabRecord with engine-computed sequence fields", () => {
    const record: TabRecord = {
      title: "A",
      url: "https://a.test",
      favIconUrl: "https://a.test/favicon.ico",
      domain: "a.test",
      pinned: false,
      index: 0,
      windowSeq: 1,
      windowTabSeq: 1,
      globalSeq: 1,
    };

    expect(record.globalSeq).toBe(1);
  });

  it("carries text always and html optionally in Rendered", () => {
    const textOnly: Rendered = { text: "https://a.test" };
    const withHtml: Rendered = { text: "https://a.test", html: "<a href=\"https://a.test\">A</a>" };

    expect(textOnly.html).toBeUndefined();
    expect(withHtml.html).toContain("<a");
  });

  it("discriminates CopyPayload by scope and exposes flattened entries for window payloads", () => {
    const record: TabRecord = { title: "A", url: "https://a.test", globalSeq: 1 };
    const tabPayload: CopyPayload = {
      scope: "tab",
      entries: [record],
      rendered: { text: "https://a.test" },
    };
    const windowPayload: CopyPayload = {
      scope: "window",
      windows: [{ windowSeq: 1, entries: [record] }],
      entries: [record],
    };

    expect(tabPayload.scope === "tab" && tabPayload.entries.length).toBe(1);
    expect(windowPayload.scope === "window" && windowPayload.windows[0]!.windowSeq).toBe(1);
    expect(windowPayload.scope === "window" && windowPayload.entries.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** From `apps/extension`:

  `bunx vitest run lib/copy/types.test.ts`

  Expected failure: module resolution error, e.g. `Failed to resolve import "./types.ts"` / `Cannot find module './types.ts'` (the file does not exist yet).

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/types.ts` with the complete code below.

```ts
export const SCOPE_IDS = [
  "highlighted-tabs",
  "window-tabs",
  "all-tabs",
  "all-windows-and-tabs",
] as const satisfies readonly ScopeId[];

export type ScopeId =
  | "highlighted-tabs"
  | "window-tabs"
  | "all-tabs"
  | "all-windows-and-tabs";

// Donor scope.ts: every scope except the single window scope is a tab scope.
export function isTabScopeId(id: ScopeId): id is Exclude<ScopeId, "all-windows-and-tabs"> {
  return id !== "all-windows-and-tabs";
}

export interface TabLite {
  id: number;
  url: string;
  title: string;
  index: number;
  pinned: boolean;
  favIconUrl?: string;
  highlighted?: boolean;
}

export interface WindowLite {
  id: number;
  tabs: TabLite[];
}

export interface ScopeSnapshot {
  windows: WindowLite[];
  currentWindowId: number;
  highlightedTabIds: number[];
}

export type ScopeSelection =
  | { scope: "tab"; tabs: TabLite[] }
  | { scope: "window"; windows: WindowLite[] };

export interface TabRecord {
  title: string;
  url: string;
  favIconUrl?: string;
  domain?: string;
  pinned?: boolean;
  index?: number;
  windowSeq?: number;
  windowTabSeq?: number;
  globalSeq: number;
}

export type Rendered = { text: string; html?: string };

export type CopyPayload =
  | { scope: "tab"; entries: TabRecord[]; rendered?: Rendered }
  | {
      scope: "window";
      windows: { windowSeq: number; entries: TabRecord[] }[];
      entries: TabRecord[];
      rendered?: Rendered;
    };
```

- [ ] **Step 4: Run the test, expect PASS.** From `apps/extension`:

  `bunx vitest run lib/copy/types.test.ts`

  Expected: all tests in `lib/copy/types.test.ts` pass (1 file, 9 tests passed).

- [ ] **Step 5: Commit.** From the repo root:

  `git add apps/extension/lib/copy/types.ts apps/extension/lib/copy/types.test.ts && git commit -m "feat(copy): add shared copy types"`

---

### Task B1: Port string helpers (`lib/copy/string.ts`)

Port `sentenceCase`, `indent`, and `encodeHtml` byte-exact from the donor `tab-copy-master/src/util/string.ts`. These become an own module so both `format.ts` and `template.ts` can import them without creating a format↔template dependency.

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/string.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { encodeHtml, indent, sentenceCase } from "@/lib/copy/string.ts";

describe("sentenceCase", () => {
  it("returns empty string for empty / undefined input", () => {
    // donor: `if (!text) return ''`
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase(undefined)).toBe("");
  });

  it("upper-cases the first character and leaves the rest untouched", () => {
    // donor: `${text[0].toLocaleUpperCase()}${text.substring(1)}`
    expect(sentenceCase("hello world")).toBe("Hello world");
    expect(sentenceCase("a")).toBe("A");
  });

  it("does not lower-case the remaining characters", () => {
    expect(sentenceCase("hELLO")).toBe("HELLO");
  });
});

describe("indent", () => {
  it("prefixes every line with 2 spaces by default", () => {
    // donor: `text.replace(/^/gm, ' '.repeat(indent))`, default indent = 2
    expect(indent("a\nb")).toBe("  a\n  b");
  });

  it("indents a blank line too (^ matches start of every line)", () => {
    expect(indent("a\n\nb")).toBe("  a\n  \n  b");
  });

  it("respects a custom indent width", () => {
    expect(indent("x", 4)).toBe("    x");
  });
});

describe("encodeHtml", () => {
  it("escapes & < > ' and \" in that order", () => {
    // donor order: & -> &amp;, < -> &lt;, > -> &gt;, ' -> &#39;, " -> &#34;
    expect(encodeHtml(`<a href="x" title='y'>&z</a>`)).toBe(
      "&lt;a href=&#34;x&#34; title=&#39;y&#39;&gt;&amp;z&lt;/a&gt;",
    );
  });

  it("escapes ampersand first so existing entities are double-encoded", () => {
    // donor replaces & before < , so &lt; in input becomes &amp;lt;
    expect(encodeHtml("&lt;")).toBe("&amp;lt;");
  });
});
```

- [ ] **Step 2: Run it & expect FAIL.** From `apps/extension`:

```
bunx vitest run lib/copy/string.test.ts
```

Expect failure: cannot resolve / import `@/lib/copy/string.ts` (module does not exist) — e.g. `Failed to load url @/lib/copy/string.ts` / `No test suite found`.

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/string.ts` (byte-exact port of donor `util/string.ts`):

```ts
export function sentenceCase(text?: string): string {
  if (!text) return "";

  return `${text[0]!.toLocaleUpperCase()}${text.substring(1)}`;
}

export function indent(text: string, indent = 2): string {
  return text.replace(/^/gm, " ".repeat(indent));
}

// https://stackoverflow.com/a/11561642/384062
export function encodeHtml(html: string): string {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&#34;");
}
```

- [ ] **Step 4: Run & expect PASS.** From `apps/extension`:

```
bunx vitest run lib/copy/string.test.ts
```

All cases green.

- [ ] **Step 5: Commit.**

```
git add apps/extension/lib/copy/string.ts apps/extension/lib/copy/string.test.ts && git commit -m "feat(copy): port sentenceCase/indent/encodeHtml string helpers"
```

### Task B2: Port CSV row stringifier (`lib/copy/csv.ts`)

Port only the **stringify** half the copy engine needs: `stringifyCSVRow` (and its supporting `stringifyCSVRows`) with RFC-style quoting. The donor parser/CSVModel half is dead weight for the copy engine and is dropped. Byte-exact quoting rules from `tab-copy-master/src/util/csv.ts`.

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { stringifyCSVRow, stringifyCSVRows } from "@/lib/copy/csv.ts";

describe("stringifyCSVRow", () => {
  it("joins plain string fields with commas, no quoting", () => {
    // donor: fields without comma/quote/newline/edge-space are emitted bare
    expect(stringifyCSVRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("quotes a field containing a comma", () => {
    // donor rxNeedsQuoting: /^\s|\s$|,|"|\n/
    expect(stringifyCSVRow(["a,b", "c"])).toBe('"a,b",c');
  });

  it("quotes and doubles internal quotes", () => {
    // donor: `"${value.replace(/"/g, '""')}"`
    expect(stringifyCSVRow(['he said "hi"'])).toBe('"he said ""hi"""');
  });

  it("quotes a field containing a newline", () => {
    expect(stringifyCSVRow(["line1\nline2"])).toBe('"line1\nline2"');
  });

  it("quotes a field with leading or trailing whitespace", () => {
    // donor: /^\s|\s$/ branches
    expect(stringifyCSVRow([" lead"])).toBe('" lead"');
    expect(stringifyCSVRow(["trail "])).toBe('"trail "');
  });

  it("renders null fields as empty and numbers as base-10 strings", () => {
    // donor stringifyFieldValue: null -> '', number -> toString(10)
    expect(stringifyCSVRow([null, 42, "x"])).toBe(",42,x");
  });
});

describe("stringifyCSVRows", () => {
  it("joins rows with a single newline", () => {
    // donor: rows.map(stringifyCSVRow).join('\n')
    expect(
      stringifyCSVRows([
        ["title", "url"],
        ["a,b", "http://x"],
      ]),
    ).toBe('title,url\n"a,b",http://x');
  });
});
```

- [ ] **Step 2: Run it & expect FAIL.** From `apps/extension`:

```
bunx vitest run lib/copy/csv.test.ts
```

Expect failure: cannot resolve `@/lib/copy/csv.ts` (module does not exist).

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/csv.ts` (stringify half ported byte-exact; parser/CSVModel dropped as unused by the copy engine):

```ts
type FieldValue = string | number | null;
type Row = FieldValue[];

const DELIMITER = ",";

// If a string has leading or trailing space,
// or contains a comma, double quote, or a newline
// it needs to be quoted in CSV output
const rxNeedsQuoting = /^\s|\s$|,|"|\n/;

export const stringifyCSVRows = (rows: Row[]): string =>
  rows.map((row) => stringifyCSVRow(row)).join("\n");

export const stringifyCSVRow = (row: Row): string =>
  row.map((val) => stringifyFieldValue(val)).join(DELIMITER);

function stringifyFieldValue(fieldValue: FieldValue): string {
  if (fieldValue == null) {
    return "";
  }

  if (typeof fieldValue === "string" && rxNeedsQuoting.test(fieldValue)) {
    return `"${fieldValue.replace(/"/g, '""')}"`;
  }

  if (typeof fieldValue === "number") {
    return fieldValue.toString(10);
  }

  return fieldValue;
}
```

- [ ] **Step 4: Run & expect PASS.** From `apps/extension`:

```
bunx vitest run lib/copy/csv.test.ts
```

All cases green.

- [ ] **Step 5: Commit.**

```
git add apps/extension/lib/copy/csv.ts apps/extension/lib/copy/csv.test.ts && git commit -m "feat(copy): port stringifyCSVRow RFC quoting helper"
```

---

### Task C: Pure `selectScope` over a `ScopeSnapshot`

Module C is pure logic: given a `ScopeSnapshot` (already-gathered windows + the current window id + the highlighted tab ids), produce a `ScopeSelection`. Depends only on Module A's `lib/copy/types.ts`. The Chrome-side `getScopeSnapshot()` lives in Module K (`tabs-service.ts`); Module C never touches `chrome.*`.

Donor parity reference (`tab-copy-master/src/util/tabs.ts`):
- `highlighted-tabs` — donor `getTabs`: `unfilteredWindowTabs` = current window's tabs filtered to `tab.url` ONLY, then `.filter(({ highlighted }) => !!highlighted)`. The pinned `filter` is deliberately NOT applied (comment: "`highlighted-tabs` scope is not subject to filtering"). PINNED-IMMUNE.
- `window-tabs` — donor: current-window tabs, `tab.url` truthy AND `(!filter || filter(tab))` where filter is `({pinned}) => !pinned` when ignoring pinned. So url-truthy + `(includePinned || !pinned)`.
- `all-tabs` — donor `getWindowsAndAllTabs` → `getWindowsAndTabs`: each window's tabs filtered to `tab.url && (!filter || filter(tab))`, then flattened. Same per-tab filter as window-tabs but across all windows.
- `all-windows-and-tabs` — donor `getWindowsAndTabs`: same per-tab filter, kept grouped, then `.filter(({ tabs }) => tabs.length)` DROPS windows that became empty.

Deviation honored: Module C takes an explicit `includePinned: boolean` (spec §9 deviation 2 — Copy's own flag, default include pinned) instead of the donor's option lookup. `includePinned === true` means "no pinned filter" (donor `filter === undefined`); `false` means drop pinned (donor `({pinned}) => !pinned`).

`url`-truthy means `tab.url` is a non-empty string. Output ordering preserves snapshot order (donor never re-sorts here).

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/scope.test.ts` with the COMPLETE test code below. It exercises every scope, pinned immunity for highlighted-tabs, the pinned filter for the other scopes, url-truthy filtering, and the empty-window drop.

```ts
import { describe, expect, it } from "vitest";

import { selectScope } from "./scope.ts";
import type { ScopeSnapshot, TabLite, WindowLite } from "./types.ts";

function tab(partial: Partial<TabLite> & { id: number }): TabLite {
  return {
    url: `https://example.com/${partial.id}`,
    title: `Tab ${partial.id}`,
    index: 0,
    pinned: false,
    ...partial,
  };
}

// Window 1 (current): t1 highlighted+pinned, t2 highlighted, t3 plain, t4 pinned, t5 no-url.
// Window 2: t6 plain, t7 pinned, t8 no-url.
const t1 = tab({ id: 1, index: 0, pinned: true, highlighted: true });
const t2 = tab({ id: 2, index: 1, highlighted: true });
const t3 = tab({ id: 3, index: 2 });
const t4 = tab({ id: 4, index: 3, pinned: true });
const t5 = tab({ id: 5, index: 4, url: "" });
const t6 = tab({ id: 6, index: 0 });
const t7 = tab({ id: 7, index: 1, pinned: true });
const t8 = tab({ id: 8, index: 2, url: "" });

const window1: WindowLite = { id: 10, tabs: [t1, t2, t3, t4, t5] };
const window2: WindowLite = { id: 20, tabs: [t6, t7, t8] };

const snapshot: ScopeSnapshot = {
  windows: [window1, window2],
  currentWindowId: 10,
  highlightedTabIds: [1, 2],
};

describe("selectScope highlighted-tabs", () => {
  it("returns highlighted url-truthy tabs and is pinned-immune (ignores includePinned)", () => {
    // Donor: highlighted filter applied to unfiltered (url-only) current-window tabs.
    const excluded = selectScope(snapshot, "highlighted-tabs", false);
    const included = selectScope(snapshot, "highlighted-tabs", true);
    expect(excluded).toEqual({ scope: "tab", tabs: [t1, t2] });
    expect(included).toEqual({ scope: "tab", tabs: [t1, t2] });
  });

  it("drops highlighted tabs that have no url", () => {
    const snap: ScopeSnapshot = {
      windows: [{ id: 10, tabs: [t2, t5] }],
      currentWindowId: 10,
      highlightedTabIds: [2, 5],
    };
    expect(selectScope(snap, "highlighted-tabs", true)).toEqual({
      scope: "tab",
      tabs: [t2],
    });
  });
});

describe("selectScope window-tabs", () => {
  it("includes pinned when includePinned is true (url-truthy current window)", () => {
    expect(selectScope(snapshot, "window-tabs", true)).toEqual({
      scope: "tab",
      tabs: [t1, t2, t3, t4],
    });
  });

  it("drops pinned when includePinned is false", () => {
    expect(selectScope(snapshot, "window-tabs", false)).toEqual({
      scope: "tab",
      tabs: [t2, t3],
    });
  });
});

describe("selectScope all-tabs", () => {
  it("flattens url-truthy tabs across all windows with pinned filter", () => {
    expect(selectScope(snapshot, "all-tabs", false)).toEqual({
      scope: "tab",
      tabs: [t2, t3, t6],
    });
    expect(selectScope(snapshot, "all-tabs", true)).toEqual({
      scope: "tab",
      tabs: [t1, t2, t3, t4, t6, t7],
    });
  });
});

describe("selectScope all-windows-and-tabs", () => {
  it("keeps grouping, applies per-tab filter, and drops empty windows", () => {
    expect(selectScope(snapshot, "all-windows-and-tabs", true)).toEqual({
      scope: "window",
      windows: [
        { id: 10, tabs: [t1, t2, t3, t4] },
        { id: 20, tabs: [t6, t7] },
      ],
    });
  });

  it("drops a window whose tabs are all filtered out", () => {
    const snap: ScopeSnapshot = {
      windows: [
        { id: 10, tabs: [t3] },
        { id: 20, tabs: [t7] }, // only a pinned tab
      ],
      currentWindowId: 10,
      highlightedTabIds: [],
    };
    // includePinned false → window 20 becomes empty → dropped.
    expect(selectScope(snap, "all-windows-and-tabs", false)).toEqual({
      scope: "window",
      windows: [{ id: 10, tabs: [t3] }],
    });
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** From `apps/extension`:

  `bunx vitest run lib/copy/scope.test.ts`

  Expected failure: module resolution error — `Failed to resolve import "./scope.ts"` (the file does not exist yet), so every test errors out.

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/scope.ts` with the COMPLETE code below.

```ts
import type {
  ScopeId,
  ScopeSelection,
  ScopeSnapshot,
  TabLite,
  WindowLite,
} from "./types.ts";

function hasUrl(tab: TabLite): boolean {
  return typeof tab.url === "string" && tab.url.length > 0;
}

// Mirrors the donor's pinned filter: includePinned === true means no filter
// (donor `filter === undefined`); false means `({ pinned }) => !pinned`.
function passesPinned(tab: TabLite, includePinned: boolean): boolean {
  return includePinned || !tab.pinned;
}

function keepTab(tab: TabLite, includePinned: boolean): boolean {
  return hasUrl(tab) && passesPinned(tab, includePinned);
}

function currentWindow(snapshot: ScopeSnapshot): WindowLite | undefined {
  return snapshot.windows.find((win) => win.id === snapshot.currentWindowId);
}

export function selectScope(
  snapshot: ScopeSnapshot,
  scopeId: ScopeId,
  includePinned: boolean,
): ScopeSelection {
  switch (scopeId) {
    case "highlighted-tabs": {
      // Pinned-immune: donor filters url-only tabs, then by highlighted — the
      // pinned filter is never applied to this scope.
      const highlighted = new Set(snapshot.highlightedTabIds);
      const win = currentWindow(snapshot);
      const tabs = (win?.tabs ?? []).filter(
        (tab) => highlighted.has(tab.id) && hasUrl(tab),
      );
      return { scope: "tab", tabs };
    }
    case "window-tabs": {
      const win = currentWindow(snapshot);
      const tabs = (win?.tabs ?? []).filter((tab) =>
        keepTab(tab, includePinned),
      );
      return { scope: "tab", tabs };
    }
    case "all-tabs": {
      const tabs = snapshot.windows.flatMap((win) =>
        win.tabs.filter((tab) => keepTab(tab, includePinned)),
      );
      return { scope: "tab", tabs };
    }
    case "all-windows-and-tabs": {
      const windows = snapshot.windows
        .map((win) => ({
          id: win.id,
          tabs: win.tabs.filter((tab) => keepTab(tab, includePinned)),
        }))
        .filter((win) => win.tabs.length > 0);
      return { scope: "window", windows };
    }
  }
}
```

- [ ] **Step 4: Run the test, expect PASS.** From `apps/extension`:

  `bunx vitest run lib/copy/scope.test.ts`

  All 7 tests pass.

- [ ] **Step 5: Commit.**

  `git add apps/extension/lib/copy/scope.ts apps/extension/lib/copy/scope.test.ts && git commit -m "feat(copy): add pure selectScope with per-scope filter divergence"`

---

## Module D — Format registry (builtins) + `defineFormat`

**Files:** create `apps/extension/lib/copy/format.ts`; test `apps/extension/lib/copy/format.test.ts`. Depends on Module A (`lib/copy/types.ts`) and Module B (`lib/copy/string.ts` = `sentenceCase`/`indent`/`encodeHtml`, `lib/copy/csv.ts` = `stringifyCSVRow`).

**Run from** `apps/extension`. Single file: `bunx vitest run lib/copy/format.test.ts`. All: `bun run test`.

All work happens on the existing `feat/tab-copy-engine-design` branch. Imports use explicit `.ts` extensions and the `@/lib/copy/...` alias, matching contract names. Donor reference: `tab-copy-master/src/format.ts` (read EXHAUSTIVELY), `tab-copy-master/src/intl.ts`, `tab-copy-master/src/util/{string,csv}.ts`.

> **Contract pre-reqs (assumed already present from Modules A + B).** These tasks import them; if a dependency file is missing, create the minimal stub it references and note it in the commit. From `@/lib/copy/types.ts` (Module A): `TabLite`, `WindowLite`, `TabCtx`, `StartCtx`, `WindowCtx`, `Hooks`, `Transforms`. From `@/lib/copy/string.ts` (Module B): `sentenceCase`, `indent`, `encodeHtml`. From `@/lib/copy/csv.ts` (Module B): `stringifyCSVRow`.

> **Type contracts used verbatim** (do NOT redefine; import where defined by A):
> ```ts
> // these live in lib/copy/types.ts (Module A) — D imports them
> TabCtx   = { tab: TabLite; globalSeq: number; windowSeq?: number; windowTabSeq?: number; windowCount?: number };
> StartCtx = { formatName: string; tabCount: number; windowCount?: number; scope: "tab" | "window" };
> WindowCtx= { window: WindowLite; seq: number; windowCount: number; windowTabCount: number };
> Hooks    = { start?(c:StartCtx):string; windowStart?(c:WindowCtx):string; tab(c:TabCtx):string; tabDelimiter?:string; windowEnd?(c:WindowCtx):string; windowDelimiter?:string; end?(c:StartCtx):string };
> Transforms = { text: Hooks; html?: Hooks };
> ```

---

### Task D1: `defineFormat` + Format types + ids/guards

Establishes the typed registry skeleton: `defineFormat<O>` (identity that infers `O`), `Format<O>`, `FormatId`, `FormatOpts`, `getFormat`, and the guards. No builtin output logic yet — registry is seeded with one trivial format so `getFormat` is exercisable.

- [ ] **Step 1: Write the failing test** — create `apps/extension/lib/copy/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  defineFormat,
  getFormat,
  isCustomFormatId,
  isFormatId,
  type Format,
  type FormatId,
} from "@/lib/copy/format.ts";
import type { TabCtx } from "@/lib/copy/types.ts";

describe("defineFormat", () => {
  it("is an identity helper that infers opts type for typed callbacks", () => {
    const spec = defineFormat({
      id: "url" as const,
      label: () => "URL",
      transforms: () => ({ text: { tab: ({ tab }: TabCtx) => tab.url } }),
    });
    // identity: returns exactly what was passed
    expect(spec.id).toBe("url");
    expect(spec.label()).toBe("URL");
  });
});

describe("FormatId guards", () => {
  it("isFormatId accepts builtin ids and custom-* ids", () => {
    expect(isFormatId("url")).toBe(true);
    expect(isFormatId("link")).toBe(true);
    expect(isFormatId("custom-abc123")).toBe(true);
  });

  it("isFormatId rejects unknown ids", () => {
    expect(isFormatId("nope")).toBe(false);
    expect(isFormatId("")).toBe(false);
  });

  it("isCustomFormatId only matches the custom- prefix", () => {
    expect(isCustomFormatId("custom-x")).toBe(true);
    expect(isCustomFormatId("url")).toBe(false);
  });
});

describe("getFormat", () => {
  it("returns the registered builtin format by id", () => {
    const fmt: Format = getFormat("url");
    expect(fmt.id).toBe("url");
    const id: FormatId = "url";
    expect(getFormat(id).label()).toBe("URL");
  });

  it("throws on an unknown id", () => {
    // @ts-expect-error testing runtime guard with an invalid id
    expect(() => getFormat("nope")).toThrow();
  });
});
```

- [ ] **Step 2: Run it & expect FAIL** — `bunx vitest run lib/copy/format.test.ts`. Expected failure: `Failed to resolve import "@/lib/copy/format.ts"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation** — create `apps/extension/lib/copy/format.ts`:

```ts
import type { Hooks, StartCtx, TabCtx, Transforms, WindowCtx } from "@/lib/copy/types.ts";
import { sentenceCase } from "@/lib/copy/string.ts";

// --- Format type machinery (donor: tab-copy-master/src/format.ts Format<T>, but
// O is INFERRED from defaultOpts via defineFormat so callbacks are typed — removes
// donor `Record<string, any>` + ~8 `as` casts; deviation log #4, compile-time only).

export type Format<O = unknown> = {
  id: FormatId;
  label(opts?: O): string;
  description?(opts?: O): string;
  transforms(opts?: O): Transforms;
  defaultOpts?: O;
  isInvalid?(opts: O): boolean;
};

// identity helper: returns the spec unchanged, inferring O from defaultOpts (or
// from the callback param types when no defaultOpts is present).
export function defineFormat<O>(spec: Format<O>): Format<O> {
  return spec;
}

// Builtin ids are the keys of the registry, filled in by later tasks. Seeded with
// a single trivial `url` format so the registry/guards are exercisable now.
const builtinFormats: Format<unknown>[] = [
  defineFormat({
    id: "url" as FormatId,
    label: () => "URL",
    transforms: (): Transforms => ({
      text: {
        tab: ({ tab }: TabCtx) => tab.url,
      },
    }),
  }),
];

const builtinFormatIds = builtinFormats.map((f) => f.id) as readonly string[];

// donor: FormatId = builtin ids | `custom-${string}`
export type BuiltinFormatId =
  | "link"
  | "url"
  | "titleUrl1Line"
  | "titleUrl2Line"
  | "title"
  | "markdown"
  | "csv"
  | "json"
  | "htmlTable";
export type CustomFormatId = `custom-${string}`;
export type FormatId = BuiltinFormatId | CustomFormatId;

// donor: FormatOpts is a key-remapped mapped type; opts-less builtins map to
// `?: undefined`. Filled out as builtins land; declared here for downstream modules.
export type FormatOpts = {
  link: { plaintextFallback: string };
  titleUrl1Line: { separator: string };
  json: { properties: ("title" | "url" | "favIconUrl")[]; pretty: boolean; indent: string };
  htmlTable: { includeHeader: boolean };
  url?: undefined;
  titleUrl2Line?: undefined;
  title?: undefined;
  markdown?: undefined;
  csv?: undefined;
} & { [k: CustomFormatId]: { name: string; template: Record<string, string> } };

// --- guards (donor isFormatId / isCustomFormatId)

export function isCustomFormatId(id: string): id is CustomFormatId {
  return id.startsWith("custom-");
}

export function isFormatId(id: string): id is FormatId {
  return isCustomFormatId(id) || builtinFormatIds.includes(id);
}

// --- lookup (donor getFormat, but SOUND: explicit throw instead of `as`)

export function getFormat(id: FormatId): Format {
  const found = builtinFormats.find((f) => f.id === id);
  if (!found) {
    throw new Error(`Unknown format id: ${id}`);
  }
  return found;
}

// keep sentenceCase referenced for later tasks (label helpers); re-export for D2/D3.
export { sentenceCase };
```

- [ ] **Step 4: Run it & expect PASS** — `bunx vitest run lib/copy/format.test.ts`. All cases green.

- [ ] **Step 5: Commit** —
```
git add apps/extension/lib/copy/format.ts apps/extension/lib/copy/format.test.ts
git commit -m "feat(copy): add defineFormat helper, FormatId types and getFormat registry"
```

---

### Task D2: text-only builtin formats (`url`, `titleUrl1Line`, `titleUrl2Line`, `title`, `markdown`) + `link`

Implements the plain-text formats with EXACT donor delimiters and window headers, plus `link` (html anchor channel + text delegated to a fallback format via injected `getFormat`). Goldens derive from `tab-copy-master/src/format.ts`.

> **Donor-derived facts (cite in tests):**
> - `getNumberedWindowText(seq)` = `` `Window ${seq}` `` (donor line 633-635: `sentenceCase(intl.window())` → `"Window"`).
> - `url`: tab → `tab.url`; `tabDelimiter:"\n"`; `windowStart:"Window N\n\n"`; `windowDelimiter:"\n\n"` (donor 609-617).
> - `titleUrl1Line`: tab → `getTitleUrlText(url, title, sep)`; `getTitleUrlText` = `` `${title || "(untitled)"}${separator}${url}` `` with default sep `": "` (donor 92, 619-625); `tabDelimiter:"\n"`; `windowStart:"Window N\n\n"`; `windowDelimiter:"\n\n"`.
> - `titleUrl2Line`: tab → `getTitleUrlText(url, title, "\n")`; `tabDelimiter:"\n\n"`; `windowStart:"Window N\n\n"`; `windowDelimiter:"\n\n"` (donor 104-118).
> - `title`: tab → `title || url`; `tabDelimiter:"\n"`; `windowStart:"Window N\n\n"`; `windowDelimiter:"\n\n"` (donor 119-133).
> - `markdown`: tab → `` `[${(title||url).replace(/\[/g,"\\[").replace(/\]/g,"\\]")}](${url.replace(/\(/g,"\\(").replace(/\)/g,"\\)")})` ``; `windowStart:"## Window N\n\n"`; `tabDelimiter:"\n\n"`; `windowDelimiter:"\n\n"` (donor 135-159).
> - `link`: html — `windowStart:"Window N<br>\n<br>\n"`, tab → `getAnchorTagHtml(tab)`, `tabDelimiter:"<br>\n"`, `windowDelimiter:"<br>\n<br>\n"` (donor 63-72); `getAnchorTagHtml` = `tab.url ? `<a href="${tab.url}">${encodeHtml(tab.title || tab.url)}</a>` : ""` (donor 627-631). text channel delegates to fallback format (default opt `plaintextFallback:"url"`, never self-ref) (donor 22, 59-61, 713-719).

- [ ] **Step 1: Write the failing test** — append to `apps/extension/lib/copy/format.test.ts`:

```ts
import type { TabLite } from "@/lib/copy/types.ts";

const tabA: TabLite = {
  id: 1,
  url: "https://a.com/p",
  title: "Alpha",
  index: 0,
  pinned: false,
};
const tabUntitled: TabLite = {
  id: 2,
  url: "https://b.com/",
  title: "",
  index: 1,
  pinned: false,
};
const tabBrackets: TabLite = {
  id: 3,
  url: "https://c.com/(x)",
  title: "Re[mix]",
  index: 2,
  pinned: false,
};

function ctx(tab: TabLite, globalSeq = 1, windowSeq?: number): TabCtx {
  return { tab, globalSeq, windowSeq };
}

describe("url format", () => {
  it("renders tab.url, with \\n delimiter and Window header (donor format.ts:609-617)", () => {
    const t = getFormat("url").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("https://a.com/p");
    expect(t.tabDelimiter).toBe("\n");
    expect(t.windowStart!({ window: { id: 1, tabs: [] }, seq: 2, windowCount: 1, windowTabCount: 0 })).toBe("Window 2\n\n");
    expect(t.windowDelimiter).toBe("\n\n");
  });
});

describe("titleUrl1Line format", () => {
  it("joins title and url with ': ' by default (donor getTitleUrlText:619-625)", () => {
    const t = getFormat("titleUrl1Line").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("Alpha: https://a.com/p");
  });

  it("uses '(untitled)' for an empty title (donor:624)", () => {
    const t = getFormat("titleUrl1Line").transforms().text;
    expect(t.tab(ctx(tabUntitled))).toBe("(untitled): https://b.com/");
  });

  it("honors the separator opt (whole-object overlay)", () => {
    const t = getFormat("titleUrl1Line").transforms({ separator: " — " }).text;
    expect(t.tab(ctx(tabA))).toBe("Alpha — https://a.com/p");
  });
});

describe("titleUrl2Line format", () => {
  it("joins with a newline; tab delimiter is blank line (donor:104-118)", () => {
    const t = getFormat("titleUrl2Line").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("Alpha\nhttps://a.com/p");
    expect(t.tabDelimiter).toBe("\n\n");
  });
});

describe("title format", () => {
  it("falls back to url when title is empty (donor:126)", () => {
    const t = getFormat("title").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("Alpha");
    expect(t.tab(ctx(tabUntitled))).toBe("https://b.com/");
  });
});

describe("markdown format", () => {
  it("escapes [] in title and () in url; ## window header (donor:135-159)", () => {
    const t = getFormat("markdown").transforms().text;
    expect(t.tab(ctx(tabBrackets))).toBe("[Re\\[mix\\]](https://c.com/\\(x\\))");
    expect(t.tabDelimiter).toBe("\n\n");
    expect(t.windowStart!({ window: { id: 1, tabs: [] }, seq: 1, windowCount: 1, windowTabCount: 0 })).toBe("## Window 1\n\n");
  });

  it("uses url as link text when title is empty (donor:145)", () => {
    const t = getFormat("markdown").transforms().text;
    expect(t.tab(ctx(tabUntitled))).toBe("[https://b.com/](https://b.com/)");
  });
});

describe("link format", () => {
  it("html channel emits anchor tags with encoded text (donor getAnchorTagHtml:627-631)", () => {
    const h = getFormat("link").transforms().html!;
    expect(h.tab(ctx(tabA))).toBe('<a href="https://a.com/p">Alpha</a>');
    expect(h.tabDelimiter).toBe("<br>\n");
    expect(h.windowStart!({ window: { id: 1, tabs: [] }, seq: 1, windowCount: 1, windowTabCount: 0 })).toBe("Window 1<br>\n<br>\n");
  });

  it("text channel delegates to the url fallback by default (donor plaintextFallback='url':22,59-61)", () => {
    const t = getFormat("link").transforms().text;
    expect(t.tab(ctx(tabA))).toBe("https://a.com/p");
  });

  it("never delegates to itself; an explicit 'link' fallback resolves to url", () => {
    const t = getFormat("link").transforms({ plaintextFallback: "link" }).text;
    expect(t.tab(ctx(tabA))).toBe("https://a.com/p");
  });
});
```

- [ ] **Step 2: Run it & expect FAIL** — `bunx vitest run lib/copy/format.test.ts`. Expected failure: `getFormat("titleUrl1Line")` throws `Unknown format id: titleUrl1Line` (only `url` is registered, and it lacks `windowStart`/`tabDelimiter`).

- [ ] **Step 3: Write the minimal implementation** — replace the seeded `builtinFormats` array and add helpers in `apps/extension/lib/copy/format.ts`:

```ts
import { encodeHtml, indent, sentenceCase } from "@/lib/copy/string.ts";
```
(replace the existing `string.ts` import line with the above), then replace the `const builtinFormats = [...]` seed block with:

```ts
const DEFAULT_LINK_PLAINTEXT_FALLBACK = "url";
const DEFAULT_TITLE_URL_1_LINE_SEPARATOR = ": ";

// donor getNumberedWindowText (format.ts:633-635)
function numberedWindowText(seq: number): string {
  return `${sentenceCase("window")} ${seq}`;
}

// donor getTitleUrlText (format.ts:619-625)
function titleUrlText(url: string, title: string, separator = DEFAULT_TITLE_URL_1_LINE_SEPARATOR): string {
  return `${title || "(untitled)"}${separator}${url}`;
}

// donor getAnchorTagHtml (format.ts:627-631)
function anchorTagHtml(tab: TabLite): string {
  return tab.url ? `<a href="${tab.url}">${encodeHtml(tab.title || tab.url)}</a>` : "";
}

const urlTextHooks: Hooks = {
  windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
  tab: ({ tab }: TabCtx) => tab.url,
  tabDelimiter: "\n",
  windowDelimiter: "\n\n",
};

// link delegates its text channel to a fallback builtin (never itself).
function linkTextHooks(plaintextFallback?: string): Hooks {
  const fallbackId =
    plaintextFallback && isFormatId(plaintextFallback) && plaintextFallback !== "link"
      ? plaintextFallback
      : DEFAULT_LINK_PLAINTEXT_FALLBACK;
  return getFormat(fallbackId as FormatId).transforms().text;
}

const builtinFormats: Format<unknown>[] = [
  defineFormat<{ plaintextFallback: string }>({
    id: "link",
    label: () => "Link",
    transforms: (opts) => ({
      text: linkTextHooks(opts?.plaintextFallback),
      html: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}<br>\n<br>\n`,
        tab: ({ tab }: TabCtx) => anchorTagHtml(tab),
        tabDelimiter: "<br>\n",
        windowDelimiter: "<br>\n<br>\n",
      },
    }),
    defaultOpts: { plaintextFallback: DEFAULT_LINK_PLAINTEXT_FALLBACK },
  }) as Format<unknown>,

  defineFormat({
    id: "url",
    label: () => "URL",
    transforms: (): Transforms => ({ text: urlTextHooks }),
  }) as Format<unknown>,

  defineFormat<{ separator: string }>({
    id: "titleUrl1Line",
    label: () => "Title: URL",
    transforms: (opts) => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) => titleUrlText(url, title, opts?.separator),
        tabDelimiter: "\n",
        windowDelimiter: "\n\n",
      },
    }),
    defaultOpts: { separator: DEFAULT_TITLE_URL_1_LINE_SEPARATOR },
  }) as Format<unknown>,

  defineFormat({
    id: "titleUrl2Line",
    label: () => "Title & URL",
    transforms: (): Transforms => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) => titleUrlText(url, title, "\n"),
        tabDelimiter: "\n\n",
        windowDelimiter: "\n\n",
      },
    }),
  }) as Format<unknown>,

  defineFormat({
    id: "title",
    label: () => "Title",
    transforms: (): Transforms => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) => title || url,
        tabDelimiter: "\n",
        windowDelimiter: "\n\n",
      },
    }),
  }) as Format<unknown>,

  defineFormat({
    id: "markdown",
    label: () => "Markdown",
    transforms: (): Transforms => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `## ${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) =>
          `[${(title || url).replace(/\[/g, "\\[").replace(/\]/g, "\\]")}](${url
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)")})`,
        tabDelimiter: "\n\n",
        windowDelimiter: "\n\n",
      },
    }),
  }) as Format<unknown>,
];
```

Keep the `indent`/`encodeHtml` imports (D3 uses `indent`; D2 uses `encodeHtml`). Remove the now-unused `export { sentenceCase }` re-export line if oxlint flags it; otherwise leave it.

- [ ] **Step 4: Run it & expect PASS** — `bunx vitest run lib/copy/format.test.ts`. All D1 + D2 cases green.

- [ ] **Step 5: Commit** —
```
git add apps/extension/lib/copy/format.ts apps/extension/lib/copy/format.test.ts
git commit -m "feat(copy): add text builtin formats (url, title*, markdown) and link"
```

---

### Task D3: structured builtins (`csv`, `json`, `htmlTable`)

Implements the three opt-carrying structured formats. `csv` uses `stringifyCSVRow` and emits a "Window" column only in window scope; `json` mirrors the donor's `start`/`windowStart`/`tab`/`windowEnd`/`end` walk with `favIconUrl` + `properties`/`pretty`/`indent` opts + `isInvalid`; `htmlTable` toggles a header row via `includeHeader`.

> **Donor-derived facts (cite in tests):**
> - `csv` start: `tabCount ? `${scope==="window"?"Window,":""}Title,URL\n` : ""` (donor 189-190 — note `scopeType`→`scope` in our contract). tab: `stringifyCSVRow([windowSeq ? "Window N" : undefined, title || null, url].filter(x=>x!==undefined))`; `tabDelimiter:"\n"`; `windowDelimiter:"\n"` (donor 192-204). `stringifyCSVRow` joins with `,`, quotes fields needing it, renders `null`→`""` (donor csv.ts:155-172).
> - `json` defaults: `{ properties:["title","url"], pretty:true, indent:"2" }` (donor 273-285). With `pretty:true,indent:"2"`: `newline="\n"`, `indentSize=2`. start:`"["`; tab (tab scope, no windowSeq): `"\n"+indent(JSON.stringify({title,url}, undefined, 2), 2)`; `tabDelimiter:","`; end (tabCount>0): `"\n]"` (donor 222-269). `parseIndent` returns the int if 1..10 else undefined; `isInvalid` = `!!pretty && !parseIndent(indent)` (donor 286, 680-686). favIconUrl included only when present AND (no properties filter OR listed) (donor 251-253).
> - `htmlTable` default `{ includeHeader:false }` (donor 327-329). start (tabCount>0): `"<table>\n"+(includeHeader? indent(header,2)+"\n":"")+indent("<tbody>",2)+"\n"`; tab: `indent(rowHtml,4)+"\n"`; end (tabCount>0): `indent("</tbody>",2)+"\n</table>"` (donor 308-324). Header row & tab row built by donor `getHtmlTableHeaderHtml`/`getHtmlTableTabHtml` + `wrap`/`list` (donor 637-677).

- [ ] **Step 1: Write the failing test** — append to `apps/extension/lib/copy/format.test.ts`:

```ts
import type { StartCtx } from "@/lib/copy/types.ts";

const tabFav: TabLite = {
  id: 4,
  url: "https://d.com/",
  title: "Dee",
  index: 0,
  pinned: false,
  favIconUrl: "https://d.com/fav.ico",
};

function start(scope: "tab" | "window", tabCount: number): StartCtx {
  return { formatName: "test", tabCount, scope };
}

describe("csv format", () => {
  it("emits no Window column in tab scope (donor:189-190)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.start!(start("tab", 2))).toBe("Title,URL\n");
    expect(t.tab(ctx(tabA))).toBe("Alpha,https://a.com/p");
    expect(t.tabDelimiter).toBe("\n");
  });

  it("emits a Window column and per-row window cell in window scope (donor:192-204)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.start!(start("window", 2))).toBe("Window,Title,URL\n");
    expect(t.tab({ tab: tabA, globalSeq: 1, windowSeq: 1 })).toBe("Window 1,Alpha,https://a.com/p");
  });

  it("emits empty string for start when there are no tabs (donor:189)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.start!(start("tab", 0))).toBe("");
  });

  it("renders an empty title as a blank field (donor:197 title||null)", () => {
    const t = getFormat("csv").transforms().text;
    expect(t.tab(ctx(tabUntitled))).toBe(",https://b.com/");
  });
});

describe("json format", () => {
  it("renders pretty default output across the start/tab/end walk (donor:222-269)", () => {
    const t = getFormat("json").transforms().text;
    expect(t.start!(start("tab", 1))).toBe("[");
    // pretty:true, indent:2, default properties [title,url]; tab scope (no windowSeq)
    expect(t.tab(ctx(tabA))).toBe('\n  {\n    "title": "Alpha",\n    "url": "https://a.com/p"\n  }');
    expect(t.tabDelimiter).toBe(",");
    expect(t.end!(start("tab", 1))).toBe("\n]");
  });

  it("includes favIconUrl when present and selected (donor:251-253)", () => {
    const t = getFormat("json").transforms({ properties: ["title", "url", "favIconUrl"], pretty: true, indent: "2" }).text;
    expect(t.tab(ctx(tabFav))).toBe(
      '\n  {\n    "title": "Dee",\n    "url": "https://d.com/",\n    "favIconUrl": "https://d.com/fav.ico"\n  }',
    );
  });

  it("emits compact output when pretty is false (donor:214-219)", () => {
    const t = getFormat("json").transforms({ properties: ["title", "url"], pretty: false, indent: "2" }).text;
    expect(t.tab(ctx(tabA))).toBe('{"title":"Alpha","url":"https://a.com/p"}');
    expect(t.end!(start("tab", 1))).toBe("]");
  });

  it("isInvalid is true when pretty and indent is out of range (donor:286,680-686)", () => {
    const fmt = getFormat("json");
    expect(fmt.isInvalid!({ properties: ["title", "url"], pretty: true, indent: "0" })).toBe(true);
    expect(fmt.isInvalid!({ properties: ["title", "url"], pretty: true, indent: "2" })).toBe(false);
    expect(fmt.isInvalid!({ properties: ["title", "url"], pretty: false, indent: "0" })).toBe(false);
  });
});

describe("htmlTable format", () => {
  it("omits the header row by default (donor:308-317,327-329)", () => {
    const t = getFormat("htmlTable").transforms().text;
    expect(t.start!(start("tab", 1))).toBe("<table>\n  <tbody>\n");
    expect(t.tab(ctx(tabA))).toBe("    <tr>\n      <td>Alpha</td>\n      <td>https://a.com/p</td>\n    </tr>\n");
    expect(t.end!(start("tab", 1))).toBe("  </tbody>\n</table>");
  });

  it("includes a header row (with Window column in window scope) when includeHeader is set (donor:310-317,637-652)", () => {
    const t = getFormat("htmlTable").transforms({ includeHeader: true }).text;
    expect(t.start!(start("window", 1))).toBe(
      "<table>\n  <thead>\n    <tr>\n      <th>Window</th>\n      <th>Title</th>\n      <th>URL</th>\n    </tr>\n  </thead>\n  <tbody>\n",
    );
  });

  it("renders a Window cell per row in window scope (donor:654-669)", () => {
    const t = getFormat("htmlTable").transforms().text;
    expect(t.tab({ tab: tabA, globalSeq: 1, windowSeq: 2 })).toBe(
      "    <tr>\n      <td>Window 2</td>\n      <td>Alpha</td>\n      <td>https://a.com/p</td>\n    </tr>\n",
    );
  });
});
```

- [ ] **Step 2: Run it & expect FAIL** — `bunx vitest run lib/copy/format.test.ts`. Expected failure: `getFormat("csv")` throws `Unknown format id: csv` (csv/json/htmlTable not registered yet).

- [ ] **Step 3: Write the minimal implementation** — in `apps/extension/lib/copy/format.ts`, add the import and helpers, then append the three formats to `builtinFormats`. Add `stringifyCSVRow` import at top:

```ts
import { stringifyCSVRow } from "@/lib/copy/csv.ts";
```

Add these helpers (donor 637-686) above `builtinFormats`:

```ts
const DEFAULT_INDENT_SIZE = 2;
export const MAX_INDENT_SIZE = 10; // matches JSON.stringify() max

// donor parseIndent (format.ts:680-686): int in [1,10] else undefined
export function parseIndent(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  if (n && n <= MAX_INDENT_SIZE && n >= 1) return n;
  return undefined;
}

// donor wrap/list (format.ts:671-677)
function wrapTag(text: string, tag: string, contentIndent: number): string {
  return `<${tag}>\n${indent(text, contentIndent)}\n</${tag}>`;
}
function joinTruthy(...args: (string | null)[]): string {
  return args.filter(Boolean).join("\n");
}

// donor getHtmlTableHeaderHtml (format.ts:637-652)
function htmlTableHeaderHtml(scope: "tab" | "window", contentIndent: number): string {
  return wrapTag(
    wrapTag(
      joinTruthy(
        scope === "window" ? "<th>Window</th>" : null,
        "<th>Title</th>",
        "<th>URL</th>",
      ),
      "tr",
      contentIndent,
    ),
    "thead",
    contentIndent,
  );
}

// donor getHtmlTableTabHtml (format.ts:654-669)
function htmlTableTabHtml(
  title: string,
  url: string,
  windowSeq: number | undefined,
  contentIndent: number,
): string {
  return wrapTag(
    joinTruthy(
      windowSeq ? `<td>${numberedWindowText(windowSeq)}</td>` : null,
      `<td>${title || ""}</td>`,
      `<td>${url || ""}</td>`,
    ),
    "tr",
    contentIndent,
  );
}
```

Then append to `builtinFormats` (before the closing `]`):

```ts
  defineFormat({
    id: "csv",
    label: () => "CSV",
    transforms: (): Transforms => ({
      text: {
        // donor format.ts:189-190
        start: ({ scope, tabCount }: StartCtx) =>
          tabCount ? `${scope === "window" ? "Window," : ""}Title,URL\n` : "",
        // donor format.ts:192-204
        tab: ({ tab: { title, url }, windowSeq }: TabCtx) =>
          stringifyCSVRow(
            [windowSeq ? numberedWindowText(windowSeq) : undefined, title || null, url].filter(
              (item) => item !== undefined,
            ),
          ),
        tabDelimiter: "\n",
        windowDelimiter: "\n",
      },
    }),
  }) as Format<unknown>,

  defineFormat<{ properties: ("title" | "url" | "favIconUrl")[]; pretty: boolean; indent: string }>({
    id: "json",
    label: () => "JSON",
    transforms: (opts) => {
      const newline = opts?.pretty ? "\n" : "";
      const indentSize = opts?.pretty ? parseIndent(opts.indent) || DEFAULT_INDENT_SIZE : 0;
      const noProperties = !opts?.properties?.length;
      const wants = (key: "title" | "url" | "favIconUrl") =>
        noProperties || (opts?.properties ?? []).includes(key);
      return {
        text: {
          // donor format.ts:224-268
          start: () => "[",
          windowStart: ({ seq }: WindowCtx) =>
            `${newline}${indent(
              JSON.stringify({ title: numberedWindowText(seq), tabs: [] }, undefined, indentSize).replace(
                /\[\][\s\n]*\}$/,
                "[",
              ),
              indentSize,
            )}`,
          tab: ({ tab: { title, url, favIconUrl }, windowSeq }: TabCtx) =>
            `${newline}${indent(
              JSON.stringify(
                {
                  ...(title && wants("title") ? { title } : null),
                  ...(url && wants("url") ? { url } : null),
                  ...(favIconUrl && wants("favIconUrl") ? { favIconUrl } : null),
                },
                undefined,
                indentSize,
              ),
              windowSeq ? indentSize * 3 : indentSize,
            )}`,
          tabDelimiter: ",",
          windowEnd: () =>
            `${newline}${indent("]", indentSize * 2)}${newline}${indent("}", indentSize)}`,
          windowDelimiter: ",",
          end: ({ tabCount }: StartCtx) => `${tabCount ? newline : ""}]`,
        },
      };
    },
    defaultOpts: { properties: ["title", "url"], pretty: true, indent: `${DEFAULT_INDENT_SIZE}` },
    // donor format.ts:286
    isInvalid: (opts) => !!opts.pretty && !parseIndent(opts.indent),
  }) as Format<unknown>,

  defineFormat<{ includeHeader: boolean }>({
    id: "htmlTable",
    label: () => "HTML table",
    transforms: (opts) => ({
      text: {
        // donor format.ts:310-324
        start: ({ scope, tabCount }: StartCtx) =>
          tabCount
            ? `<table>\n${
                opts?.includeHeader
                  ? `${indent(htmlTableHeaderHtml(scope, DEFAULT_INDENT_SIZE), DEFAULT_INDENT_SIZE)}\n`
                  : ""
              }${indent("<tbody>", DEFAULT_INDENT_SIZE)}\n`
            : "",
        tab: ({ tab: { title, url }, windowSeq }: TabCtx) =>
          `${indent(htmlTableTabHtml(title, url, windowSeq, DEFAULT_INDENT_SIZE), DEFAULT_INDENT_SIZE * 2)}\n`,
        end: ({ tabCount }: StartCtx) =>
          tabCount ? `${indent("</tbody>", DEFAULT_INDENT_SIZE)}\n</table>` : "",
      },
    }),
    defaultOpts: { includeHeader: false },
  }) as Format<unknown>,
```

- [ ] **Step 4: Run it & expect PASS** — `bunx vitest run lib/copy/format.test.ts`. All D1+D2+D3 cases green. Also run `bun run test` to confirm no cross-file regressions, and `bunx tsgo -config tsconfig.json` to confirm types compile.

- [ ] **Step 5: Commit** —
```
git add apps/extension/lib/copy/format.ts apps/extension/lib/copy/format.test.ts
git commit -m "feat(copy): add csv, json and htmlTable structured builtin formats"
```

---

### Task E: Configured format (whole-object opts overlay)

**Module:** E — `lib/copy/configured-format.ts`
**Depends on:** A (`lib/copy/types.ts` — `FormatId`, `Transforms`), D (`lib/copy/format.ts` — `Format`, `defineFormat`, `getFormat`).
**Files:** create `apps/extension/lib/copy/configured-format.ts`; test `apps/extension/lib/copy/configured-format.test.ts`.

Resolves a registry `Format<O>` plus persisted opts into a flat `ConfiguredFormat` (opts already applied, ready for the render walk in Module G). Three parity-critical behaviors, each tested explicitly:

1. **Whole-object opts overlay** — stored opts *replace* the format's `defaultOpts` entirely; they are NOT deep-merged per key (donor `configured-format.ts` line 51: `(await getFormatOpts(id)) ?? (format as FormatWithOpts).opts` — a whole-object `??`, never a key merge).
2. **Default-opts fallback** — when `storedOpts` is `null`/`undefined`, fall back to `format.defaultOpts` (donor's `?? format.opts`).
3. **Link fallback + recursion guard** — `link`'s text channel delegates to another format's text transform; `getFormatById` is injected so we can resolve the fallback format; the fallback id is guarded `!== "link"` to prevent infinite recursion (donor `format.ts` line 715: `formatId && isFormatId(formatId) && formatId !== 'link'`).

Run all commands from `apps/extension/`.

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/configured-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolveConfiguredFormat } from "./configured-format.ts";
import { defineFormat } from "./format.ts";
import type { Format, FormatId, TabCtx } from "./format.ts";

// --- test fixtures: minimal Formats built via the Module D identity helper ---

// A format WITHOUT opts: its transforms ignore opts entirely.
const urlFormat = defineFormat({
  id: "url" as FormatId,
  label: () => "URL",
  transforms: () => ({
    text: { tab: ({ tab }: TabCtx) => tab.url },
  }),
});

// A format WITH opts: a single `separator` whose default is ": ".
// Whole-object overlay means a stored `{ separator: " | " }` fully replaces
// the default `{ separator: ": " }` — there is no other key to merge.
const titleUrlFormat = defineFormat({
  id: "titleUrl1Line" as FormatId,
  label: (o?: { separator: string }) => `Title${o?.separator ?? ": "}URL`,
  transforms: (o?: { separator: string }) => ({
    text: {
      tab: ({ tab }: TabCtx) => `${tab.title}${o?.separator ?? ": "}${tab.url}`,
    },
  }),
  defaultOpts: { separator: ": " },
});

// The `link` format: its text channel delegates to a fallback format resolved
// by id. Here it always delegates to `url`'s text transform via getFormatById.
const linkFormat = defineFormat({
  id: "link" as FormatId,
  label: () => "Link",
  transforms: () => ({
    text: { tab: ({ tab }: TabCtx) => tab.url },
    html: { tab: ({ tab }: TabCtx) => `<a href="${tab.url}">${tab.title}</a>` },
  }),
  defaultOpts: { plaintextFallback: "url" as FormatId },
});

const registry: Record<string, Format<any>> = {
  url: urlFormat,
  titleUrl1Line: titleUrlFormat,
  link: linkFormat,
};
const getFormatById = (id: FormatId): Format<any> => registry[id as string]!;

const sampleTab = {
  id: 1,
  url: "https://example.com",
  title: "Example",
  index: 0,
  pinned: false,
};

describe("resolveConfiguredFormat", () => {
  it("flattens id, label, and transforms for an opts-less format", () => {
    const cf = resolveConfiguredFormat(urlFormat, undefined, getFormatById);
    expect(cf.id).toBe("url");
    expect(cf.label).toBe("URL");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
  });

  it("falls back to the format's defaultOpts when storedOpts is nullish", () => {
    const cf = resolveConfiguredFormat(titleUrlFormat, undefined, getFormatById);
    expect(cf.label).toBe("Title: URL");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "Example: https://example.com",
    );
  });

  it("applies stored opts as a WHOLE-OBJECT replace (not a deep merge)", () => {
    // stored opts replace defaults entirely; a partial object that omits a
    // default key must NOT inherit it — proving overlay is replace, not merge.
    const cf = resolveConfiguredFormat(
      titleUrlFormat,
      { separator: " | " },
      getFormatById,
    );
    expect(cf.label).toBe("Title | URL");
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "Example | https://example.com",
    );
  });

  it("resolves the link text channel through the injected getFormatById fallback", () => {
    const cf = resolveConfiguredFormat(linkFormat, undefined, getFormatById);
    // text channel delegates to `url`'s tab transform (plaintext fallback)
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
    // html channel is link's own anchor markup
    expect(cf.transforms.html?.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      '<a href="https://example.com">Example</a>',
    );
  });

  it("guards the link fallback against self-reference (no infinite recursion)", () => {
    // even if stored opts point the fallback back at `link`, resolution must
    // not recurse — it falls through to the default `url` text transform.
    const cf = resolveConfiguredFormat(
      linkFormat,
      { plaintextFallback: "link" as FormatId },
      getFormatById,
    );
    expect(cf.transforms.text.tab({ tab: sampleTab, globalSeq: 1 })).toBe(
      "https://example.com",
    );
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.**
  Command: `bunx vitest run lib/copy/configured-format.test.ts`
  Expected: failure resolving the import — `Failed to resolve import "./configured-format.ts"` (module does not exist yet), so all 5 tests error.

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/configured-format.ts`:

```ts
import type { FormatId, Transforms } from "./types.ts";
import type { Format } from "./format.ts";

// Module E contract: opts already applied, whole-object overlay.
export interface ConfiguredFormat {
  id: FormatId;
  label: string;
  transforms: Transforms;
}

// The plaintext fallback id carried by the `link` format's opts.
type LinkOpts = { plaintextFallback: FormatId };

/**
 * Resolve a registry Format + persisted opts into a flat ConfiguredFormat.
 *
 * Opts overlay is a WHOLE-OBJECT replace: when storedOpts is present it
 * fully replaces format.defaultOpts (donor configured-format.ts uses
 * `storedOpts ?? defaultOpts`, never a per-key merge). Parity-critical.
 *
 * getFormatById is injected so `link` can resolve its plaintext fallback
 * format; the fallback id is guarded `!== "link"` to prevent recursion.
 */
export function resolveConfiguredFormat(
  format: Format<any>,
  // Storage boundary: persisted opts are untrusted JSON. This `unknown` is the
  // single deviation-#4 cast point — the storage adapter is the only caller
  // that produces it, and the whole-object overlay below never inspects shape.
  storedOpts: unknown,
  getFormatById: (id: FormatId) => Format<any>,
): ConfiguredFormat {
  // Whole-object overlay: stored opts replace defaults entirely (NOT a merge).
  const opts = (storedOpts ?? format.defaultOpts) as Record<string, unknown> | undefined;

  const transforms = format.transforms(opts);

  // Link's text channel delegates to a fallback format's text transform.
  // Guard the fallback id against "link" to avoid infinite recursion.
  if (format.id === "link") {
    const fallbackId = (opts as LinkOpts | undefined)?.plaintextFallback;
    const resolvedFallbackId: FormatId =
      fallbackId && fallbackId !== "link" ? fallbackId : "url";
    const fallbackFormat = getFormatById(resolvedFallbackId);
    transforms.text = fallbackFormat.transforms(fallbackFormat.defaultOpts).text;
  }

  return {
    id: format.id,
    label: format.label(opts),
    transforms,
  } satisfies ConfiguredFormat;
}
```

- [ ] **Step 4: Run the test, expect PASS.**
  Command: `bunx vitest run lib/copy/configured-format.test.ts`
  Expected: all 5 tests pass.

- [ ] **Step 5: Commit.**
  `git add apps/extension/lib/copy/configured-format.ts apps/extension/lib/copy/configured-format.test.ts && git commit -m "feat(copy): add configured-format whole-object opts overlay (Module E)"`

**Deviation notes honored:**
- Storage-boundary cast (deviation #4): `storedOpts: unknown` is the single untrusted-JSON cast point; documented in the function comment and isolated here.
- Whole-object overlay (spec §5): tested explicitly by `{ separator: " | " }` replacing the full default object; the omitted-key/no-merge intent is asserted by the label + tab output.
- Link recursion guard (Module D §5): `fallbackId !== "link"` falls through to `"url"`, tested by the self-reference case.

**Contract conformance:** `ConfiguredFormat = { id; label; transforms }` matches the Module E contract verbatim. `Transforms`/`FormatId`/`TabCtx` imported from Modules A/D; `Format`/`defineFormat`/`getFormat` from Module D.

---

### Task F: Custom-format template engine (`lib/copy/template.ts`)

Port the donor token/template engine (`tab-copy-master/src/template-field.ts` + the `interpolate` reducer in `tab-copy-master/src/format.ts`). The engine exposes `TEMPLATE_FIELDS` (7 fields, each with a per-field token allow-list) and an `interpolate(fieldId, template, sources)` function. For a given field, only the tokens in that field's allow-list are replaced; any token NOT in the allow-list survives **literally** as `[token]` (donor behavior: `getFieldTokens(fieldId).reduce(...)` never touches out-of-list tokens). Date/time tokens draw from an injected `Clock`; URL tokens draw from an injected `parseUrl` so output is deterministic. DEVIATION #5: a malformed/unparseable URL yields an **empty** token value, it does NOT throw mid-copy (donor calls `new URL(tab.url!)` and throws).

Dependencies: Module A (`@/lib/copy/types.ts` → `TabLite`), Module B (`@/lib/copy/string.ts` → `encodeHtml`). `regExEscape` is template-local (donor keeps it in `util/regex.ts`; we inline a private copy here to avoid a B-side dependency it doesn't own).

This is one focused TDD task with a single red→green cycle followed by edge-case tests folded in before the commit (the implementation is small and cohesive — splitting it would force throwaway stubs).

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/template.test.ts` with COMPLETE code below. Golden strings are derived from the donor: token texts/aliases from `template-field.ts`; `interpolate` reducer semantics from `format.ts:688`; `[date]` uses `now.toLocaleDateString()`, `[time]` uses `now.toLocaleTimeString()`, `[date+time]` uses `now.toLocaleString()`; `[link]` text channel = `tab.url`, html channel = `<a href="...">encodeHtml(title||url)</a>` (donor `getAnchorTagHtml`); html `[n]` = `<br>\n`, text `[n]` = `\n`; html `[t]` = `&#9;`, text `[t]` = `\t`; out-of-allow-list token survives as `[token]`.

```ts
import { describe, expect, it } from "vitest";

import {
  TEMPLATE_FIELDS,
  getFieldTokens,
  interpolate,
  type TemplateFieldId,
} from "./template.ts";
import type { TabLite } from "./types.ts";

// Fixed instant so [date]/[time] tokens are deterministic regardless of locale/TZ.
const NOW = new Date("2026-06-26T15:04:05.000Z");
const clock = () => NOW;

// Deterministic URL parser injection: real URL parse, malformed -> null (DEVIATION #5).
const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const tab: TabLite = {
  id: 1,
  url: "https://example.com/docs/guide?q=1#frag",
  title: "Hello & <World>",
  index: 0,
  pinned: false,
  favIconUrl: "https://example.com/favicon.ico",
};

describe("TEMPLATE_FIELDS", () => {
  it("declares the 7 donor template fields in order", () => {
    // Donor template-field.ts `templateFields` ids, in order.
    expect(TEMPLATE_FIELDS.map((f) => f.id)).toEqual([
      "start",
      "windowStart",
      "tab",
      "tabDelimiter",
      "windowEnd",
      "windowDelimiter",
      "end",
    ]);
  });

  it("gates tokens per field via allow-lists", () => {
    // Donor: `tab` field allows tab-title; `tabDelimiter` only allows newline/tabulator.
    const tabTokens = getFieldTokens("tab").map((t) => t.id);
    expect(tabTokens).toContain("tab-title");
    expect(tabTokens).toContain("tab-url");
    const delimTokens = getFieldTokens("tabDelimiter").map((t) => t.id);
    expect(delimTokens).toEqual(["newline", "tabulator"]);
    expect(delimTokens).not.toContain("tab-title");
  });
});

describe("interpolate - tab field tokens (text)", () => {
  const run = (template: string) =>
    interpolate(
      "tab",
      { tab: template } as Record<TemplateFieldId, string>,
      { tab, parsedUrl: parseUrl(tab.url), tabSeq: 3, windowTabSeq: 2, windowSeq: 1, windowCount: 2, representation: "text" },
    );

  it("[title] -> tab title", () => {
    expect(run("[title]")).toBe("Hello & <World>");
  });
  it("[url] -> tab url", () => {
    expect(run("[url]")).toBe("https://example.com/docs/guide?q=1#frag");
  });
  it("[icon] -> favIconUrl", () => {
    expect(run("[icon]")).toBe("https://example.com/favicon.ico");
  });
  it("[link] text channel -> url", () => {
    // Donor tab-link token: text representation returns tab.url.
    expect(run("[link]")).toBe("https://example.com/docs/guide?q=1#frag");
  });
  it("[schema] -> protocol without trailing colon", () => {
    expect(run("[schema]")).toBe("https");
  });
  it("[host] -> url host", () => {
    expect(run("[host]")).toBe("example.com");
  });
  it("[path] -> pathname without leading slash", () => {
    expect(run("[path]")).toBe("docs/guide");
  });
  it("[query] -> search without leading question mark", () => {
    expect(run("[query]")).toBe("q=1");
  });
  it("[hash] -> hash without leading hash", () => {
    expect(run("[hash]")).toBe("frag");
  });
  it("[t#] -> tabSeq (globalSeq)", () => {
    expect(run("[t#]")).toBe("3");
  });
  it("[wt#] -> windowTabSeq", () => {
    expect(run("[wt#]")).toBe("2");
  });
  it("[w#] -> windowSeq", () => {
    expect(run("[w#]")).toBe("1");
  });
  it("[n] -> newline (text)", () => {
    expect(run("a[n]b")).toBe("a\nb");
  });
  it("[t] -> tab char (text)", () => {
    expect(run("a[t]b")).toBe("a\tb");
  });
  it("padded token text is tolerated: [ title ]", () => {
    // Donor regex captures optional surrounding whitespace inside brackets.
    expect(run("[ title ]")).toBe("Hello & <World>");
  });
});

describe("interpolate - html representation", () => {
  const run = (template: string) =>
    interpolate(
      "tab",
      { tab: template } as Record<TemplateFieldId, string>,
      { tab, parsedUrl: parseUrl(tab.url), representation: "html" },
    );

  it("[title] html-encodes the title", () => {
    expect(run("[title]")).toBe("Hello &amp; &lt;World&gt;");
  });
  it("[link] html channel -> anchor tag with encoded label", () => {
    // Donor getAnchorTagHtml: <a href="url">encodeHtml(title||url)</a>.
    expect(run("[link]")).toBe(
      '<a href="https://example.com/docs/guide?q=1#frag">Hello &amp; &lt;World&gt;</a>',
    );
  });
  it("[n] -> <br> newline (html)", () => {
    expect(run("a[n]b")).toBe("a<br>\nb");
  });
  it("[t] -> &#9; tab entity (html)", () => {
    expect(run("a[t]b")).toBe("a&#9;b");
  });
});

describe("interpolate - start/end fields, clock, counts, format name", () => {
  it("[date] uses injected clock's toLocaleDateString", () => {
    expect(
      interpolate("start", { start: "[date]" } as Record<TemplateFieldId, string>, {
        now: clock(),
        representation: "text",
      }),
    ).toBe(NOW.toLocaleDateString());
  });
  it("[time] uses injected clock's toLocaleTimeString", () => {
    expect(
      interpolate("end", { end: "[time]" } as Record<TemplateFieldId, string>, {
        now: clock(),
        representation: "text",
      }),
    ).toBe(NOW.toLocaleTimeString());
  });
  it("[date+time] uses toLocaleString", () => {
    expect(
      interpolate("start", { start: "[date+time]" } as Record<TemplateFieldId, string>, {
        now: clock(),
        representation: "text",
      }),
    ).toBe(NOW.toLocaleString());
  });
  it("[tcount]/[wcount]/[fname] resolve from sources", () => {
    expect(
      interpolate(
        "start",
        { start: "[tcount]/[wcount] [fname]" } as Record<TemplateFieldId, string>,
        { tabCount: 5, windowCount: 2, formatName: "My Format", representation: "text" },
      ),
    ).toBe("5/2 My Format");
  });
});

describe("interpolate - literal survival of out-of-allow-list tokens", () => {
  it("[title] is NOT a tabDelimiter token, survives literally", () => {
    // Donor: getFieldTokens('tabDelimiter') excludes tab-title, so its regex never runs.
    expect(
      interpolate("tabDelimiter", { tabDelimiter: "[title]" } as Record<TemplateFieldId, string>, {
        tab,
        representation: "text",
      }),
    ).toBe("[title]");
  });
  it("an unknown token survives literally in any field", () => {
    expect(
      interpolate("tab", { tab: "x[bogus]y" } as Record<TemplateFieldId, string>, {
        tab,
        parsedUrl: parseUrl(tab.url),
        representation: "text",
      }),
    ).toBe("x[bogus]y");
  });
});

describe("interpolate - DEVIATION #5: malformed url -> empty, no throw", () => {
  const malformed: TabLite = { id: 2, url: "about:blank", title: "Blank", index: 0, pinned: false };
  const run = (template: string) =>
    interpolate("tab", { tab: template } as Record<TemplateFieldId, string>, {
      tab: malformed,
      parsedUrl: parseUrl(malformed.url),
      representation: "text",
    });

  it("[host] on unparseable url -> empty string, does not throw", () => {
    expect(() => run("[host]")).not.toThrow();
    expect(run("[host]")).toBe("");
  });
  it("[schema]/[path]/[query]/[hash] all empty on malformed url", () => {
    expect(run("[schema][path][query][hash]")).toBe("");
  });
});

describe("interpolate - pinned-clock determinism", () => {
  it("repeated [date] interpolations with the same clock are stable", () => {
    const a = interpolate("start", { start: "[date] [time]" } as Record<TemplateFieldId, string>, {
      now: clock(),
      representation: "text",
    });
    const b = interpolate("start", { start: "[date] [time]" } as Record<TemplateFieldId, string>, {
      now: clock(),
      representation: "text",
    });
    expect(a).toBe(b);
    expect(a).toBe(`${NOW.toLocaleDateString()} ${NOW.toLocaleTimeString()}`);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** From `apps/extension`:
  `bunx vitest run lib/copy/template.test.ts`
  Expected: failure resolving the module — `Failed to load url ./template.ts` / `Cannot find module './template.ts'` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/template.ts` with COMPLETE code below. Ported from `template-field.ts` (token specs + field allow-lists) and the `interpolate` reducer in `format.ts:688`. Deviations honored: injected `now`/`parseUrl` via `TokenValueSources` (no `new Date()`/`new URL()` inside); malformed URL surfaces as `parsedUrl: null` → tokens emit `''` (no throw).

```ts
import { encodeHtml } from "@/lib/copy/string.ts";
import type { TabLite } from "@/lib/copy/types.ts";

// Normalized sources a token value may draw from. `now`/`parsedUrl` are INJECTED
// (deterministic). DEVIATION #5: an unparseable url is passed as `parsedUrl: null`,
// and url tokens emit "" rather than throwing.
export interface TokenValueSources {
  now?: Date;
  tabSeq?: number;
  windowTabSeq?: number;
  windowSeq?: number;
  tabCount?: number;
  windowTabCount?: number;
  windowCount?: number;
  tab?: TabLite;
  parsedUrl?: URL | null;
  formatName?: string;
  representation?: "text" | "html";
}

export interface Token {
  id: string;
  token: string; // inline token text, e.g. "title" for [title]
  aliases?: string[]; // historic alternate token texts
  value: (source: TokenValueSources) => string;
}

export type TemplateFieldId =
  | "start"
  | "windowStart"
  | "tab"
  | "tabDelimiter"
  | "windowEnd"
  | "windowDelimiter"
  | "end";

// Local regex escape (donor util/regex.ts). Kept private so Module B (string.ts)
// need not own it.
function regExEscape(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Stringify with a special case for undefined (donor `stringify`).
function stringify(val: unknown): string {
  return val === undefined ? "" : `${val}`;
}

function encode(
  value: string | null | undefined,
  representation: "text" | "html" = "text",
): string {
  return representation === "html" ? encodeHtml(value ?? "") : (value ?? "");
}

// Donor getAnchorTagHtml, inlined to avoid a template -> format dependency.
function anchorTagHtml(tab: TabLite): string {
  return tab.url ? `<a href="${tab.url}">${encodeHtml(tab.title || tab.url)}</a>` : "";
}

const tokens: Token[] = [
  { id: "tab-number", token: "t#", aliases: ["#", "number", "tab#", "tabnumber", "tab #", "tab number", "tab-#", "tab-number", "tab+#", "tab+number"], value: ({ tabSeq }) => stringify(tabSeq) },
  { id: "window-tab-number", token: "wt#", value: ({ windowTabSeq, tabSeq }) => stringify(windowTabSeq ?? tabSeq) },
  { id: "window-number", token: "w#", value: ({ windowSeq }) => stringify(windowSeq) },
  { id: "tab-count", token: "tcount", aliases: ["count"], value: ({ tabCount }) => stringify(tabCount) },
  { id: "window-tab-count", token: "wtcount", value: ({ windowTabCount }) => stringify(windowTabCount) },
  { id: "window-count", token: "wcount", value: ({ windowCount }) => stringify(windowCount) },
  { id: "tab-title", token: "title", value: ({ tab, representation }) => encode(tab?.title, representation) },
  { id: "tab-url", token: "url", value: ({ tab, representation }) => encode(tab?.url, representation) },
  {
    id: "tab-link",
    token: "link",
    value: ({ tab, representation }) =>
      tab ? (representation === "html" ? anchorTagHtml(tab) : (tab.url ?? "")) : "",
  },
  { id: "tab-icon", token: "icon", value: ({ tab, representation }) => encode(tab?.favIconUrl, representation) },
  { id: "tab-url-schema", token: "schema", aliases: ["protocol"], value: ({ parsedUrl }) => parsedUrl?.protocol.replace(/:$/, "") ?? "" },
  { id: "tab-url-host", token: "host", value: ({ parsedUrl, representation }) => encode(parsedUrl?.host, representation) },
  { id: "tab-url-path", token: "path", value: ({ parsedUrl, representation }) => encode(parsedUrl?.pathname.replace(/^\//, ""), representation) },
  { id: "tab-url-query", token: "query", value: ({ parsedUrl, representation }) => encode(parsedUrl?.search.replace(/^\?/, ""), representation) },
  { id: "tab-url-hash", token: "hash", value: ({ parsedUrl, representation }) => encode(parsedUrl?.hash.replace(/^#/, ""), representation) },
  { id: "date", token: "date", value: ({ now, representation }) => encode(now?.toLocaleDateString(), representation) },
  { id: "time", token: "time", value: ({ now, representation }) => encode(now?.toLocaleTimeString(), representation) },
  { id: "date-time", token: "date+time", aliases: ["datetime", "date time", "date-time"], value: ({ now, representation }) => encode(now?.toLocaleString(), representation) },
  { id: "newline", token: "n", aliases: ["newline"], value: ({ representation }) => (representation === "html" ? "<br>\n" : "\n") },
  { id: "tabulator", token: "t", aliases: ["tab"], value: ({ representation }) => (representation === "html" ? "&#9;" : "\t") },
  { id: "format-name", token: "fname", aliases: ["formatname", "format name", "format-name", "format+name"], value: ({ formatName, representation }) => encode(formatName, representation) },
];

// Creates a regex matching a token (incl. aliases) inside brackets, tolerating
// surrounding whitespace. Donor makeTokenRegExp.
function makeTokenRegExp(token: Token): RegExp {
  const alternation = [token.token, ...(token.aliases ?? [])].map(regExEscape).join("|");
  return new RegExp(`\\[(\\s*(${alternation})\\s*)]`, "g");
}

interface TokenWithRegex extends Token {
  regex: RegExp;
}

const tokensWithRegex: TokenWithRegex[] = tokens.map((token) => ({
  ...token,
  regex: makeTokenRegExp(token),
}));

function byId(id: string): TokenWithRegex {
  const token = tokensWithRegex.find((t) => t.id === id);
  if (!token) throw new Error(`unknown token id: ${id}`);
  return token;
}

function select(...ids: string[]): TokenWithRegex[] {
  return ids.map(byId);
}

export interface TemplateField {
  id: TemplateFieldId;
  tokens: TokenWithRegex[];
}

// 7 fields with per-field token allow-lists (donor templateFields).
export const TEMPLATE_FIELDS: TemplateField[] = [
  { id: "start", tokens: select("tab-count", "window-count", "date", "time", "date-time", "newline", "tabulator", "format-name") },
  { id: "windowStart", tokens: select("window-number", "window-count", "window-tab-count", "newline", "tabulator") },
  {
    id: "tab",
    tokens: select(
      "tab-title", "tab-url", "tab-icon", "tab-link", "tab-url-schema", "tab-url-host",
      "tab-url-path", "tab-url-query", "tab-url-hash", "tab-number", "window-tab-number",
      "window-number", "window-count", "date", "time", "date-time", "newline", "tabulator",
    ),
  },
  { id: "tabDelimiter", tokens: select("newline", "tabulator") },
  { id: "windowEnd", tokens: select("window-number", "window-count", "window-tab-count", "newline", "tabulator") },
  { id: "windowDelimiter", tokens: select("newline", "tabulator") },
  { id: "end", tokens: select("tab-count", "window-count", "date", "time", "date-time", "newline", "tabulator", "format-name") },
];

export function getFieldTokens(fieldId: TemplateFieldId): TokenWithRegex[] {
  return TEMPLATE_FIELDS.find((f) => f.id === fieldId)?.tokens ?? [];
}

// Interpolates the field's template string: starting from template[fieldId],
// replaces each allow-listed token with its value. Tokens NOT in the field's
// allow-list are never matched, so they survive literally as [token]. Donor
// `interpolate` (format.ts).
export function interpolate(
  fieldId: TemplateFieldId,
  template: Record<TemplateFieldId, string> | undefined,
  sources: TokenValueSources = {},
): string {
  if (!template) return "";

  return getFieldTokens(fieldId).reduce(
    (acc, token) => acc.replace(token.regex, token.value(sources)),
    template[fieldId] ?? "",
  );
}
```

- [ ] **Step 4: Run the test, expect PASS.** From `apps/extension`:
  `bunx vitest run lib/copy/template.test.ts`
  Expected: all tests pass. Then run `bun run test` to confirm no regressions in the wider suite.

- [ ] **Step 5: Commit.**
  `git add apps/extension/lib/copy/template.ts apps/extension/lib/copy/template.test.ts && git commit -m "feat(copy): port custom-format template token engine"`

---

### Task G: render walk (assembly of Hooks into Rendered)

Implements `render(selection, format): Rendered` — the pure walk that turns a `ScopeSelection` + a `ConfiguredFormat` into `{ text, html? }`. Ported from the donor's `applyTextTransformToTabs`/`applyTextTransformToWindows` (`tab-copy-master/src/copy.ts:114-222`) and `getRepresentations` (`copy.ts:93-112`), honoring the contract deviations (`scope` instead of donor `scopeType`; `formatName` from `ConfiguredFormat.label`; empty-selection still fires start/end; no logging).

Depends on Modules A (`types.ts`), D (`format.ts` hook shapes), E (`configured-format.ts`). The test hand-rolls `Transforms` fixtures so the walk is exercised in isolation.

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/copy/render.test.ts` with the COMPLETE contents below. Golden strings are derived from the donor `format.ts` transforms (cited inline).

```ts
import { describe, expect, it } from "vitest";

import { render } from "./render.ts";
import type { ConfiguredFormat, Transforms } from "./configured-format.ts";
import type { ScopeSelection, TabLite, WindowLite } from "./types.ts";

function tab(id: number, title: string, url: string, index: number): TabLite {
  return { id, title, url, index, pinned: false };
}

// `url` format text channel — donor format.ts:609-617 (urlTextTransform):
//   tab => tab.url ; tabDelimiter '\n' ; windowStart `Window ${seq}\n\n` ;
//   windowDelimiter '\n\n' ; no start/end.
const urlTransforms: Transforms = {
  text: {
    windowStart: ({ seq }) => `Window ${seq}\n\n`,
    tab: ({ tab }) => tab.url,
    tabDelimiter: "\n",
    windowDelimiter: "\n\n",
  },
};

// html-channel format — donor `link` html hooks, format.ts:63-71 + getAnchorTagHtml (format.ts:627-631):
//   html.tab => `<a href="url">title</a>` ; tabDelimiter '<br>\n' ;
//   windowStart `Window ${seq}<br>\n<br>\n` ; windowDelimiter '<br>\n<br>\n'.
const linkTransforms: Transforms = {
  text: {
    tab: ({ tab }) => tab.url,
    tabDelimiter: "\n",
    windowStart: ({ seq }) => `Window ${seq}\n\n`,
    windowDelimiter: "\n\n",
  },
  html: {
    windowStart: ({ seq }) => `Window ${seq}<br>\n<br>\n`,
    tab: ({ tab }) => `<a href="${tab.url}">${tab.title || tab.url}</a>`,
    tabDelimiter: "<br>\n",
    windowDelimiter: "<br>\n<br>\n",
  },
};

function configured(transforms: Transforms): ConfiguredFormat {
  return { id: "url", label: "URL", transforms };
}

const tabs: TabLite[] = [
  tab(1, "Alpha", "https://a.example.com/", 0),
  tab(2, "Beta", "https://b.example.com/", 1),
];

const windows: WindowLite[] = [
  { id: 10, tabs: [tab(1, "Alpha", "https://a.example.com/", 0), tab(2, "Beta", "https://b.example.com/", 1)] },
  { id: 11, tabs: [tab(3, "Gamma", "https://c.example.com/", 0)] },
];

describe("render — tab scope", () => {
  it("joins tab hooks with the tab delimiter (text only when no html transform)", () => {
    const selection: ScopeSelection = { scope: "tab", tabs };
    const result = render(selection, configured(urlTransforms));
    expect(result).toEqual({
      text: "https://a.example.com/\nhttps://b.example.com/",
    });
    expect(result.html).toBeUndefined();
  });

  it("renders both channels when transforms.html is present", () => {
    const selection: ScopeSelection = { scope: "tab", tabs };
    const result = render(selection, configured(linkTransforms));
    expect(result.text).toBe("https://a.example.com/\nhttps://b.example.com/");
    expect(result.html).toBe(
      '<a href="https://a.example.com/">Alpha</a><br>\n<a href="https://b.example.com/">Beta</a>',
    );
  });

  it("numbers globalSeq 1-based across the tab list", () => {
    const seqs: number[] = [];
    const probe: Transforms = {
      text: { tab: ({ globalSeq }) => { seqs.push(globalSeq); return ""; }, tabDelimiter: "" },
    };
    render({ scope: "tab", tabs }, configured(probe));
    expect(seqs).toEqual([1, 2]);
  });
});

describe("render — window scope", () => {
  it("emits windowStart/windowEnd and joins windows with windowDelimiter", () => {
    const selection: ScopeSelection = { scope: "window", windows };
    const result = render(selection, configured(urlTransforms));
    expect(result.text).toBe(
      "Window 1\n\nhttps://a.example.com/\nhttps://b.example.com/\n\nWindow 2\n\nhttps://c.example.com/",
    );
  });

  it("runs globalSeq across windows and resets windowTabSeq per window", () => {
    const captured: { globalSeq: number; windowSeq?: number; windowTabSeq?: number }[] = [];
    const probe: Transforms = {
      text: {
        tab: ({ globalSeq, windowSeq, windowTabSeq }) => {
          captured.push({ globalSeq, windowSeq, windowTabSeq });
          return "";
        },
        tabDelimiter: "",
        windowDelimiter: "",
      },
    };
    render({ scope: "window", windows }, configured(probe));
    expect(captured).toEqual([
      { globalSeq: 1, windowSeq: 1, windowTabSeq: 1 },
      { globalSeq: 2, windowSeq: 1, windowTabSeq: 2 },
      { globalSeq: 3, windowSeq: 2, windowTabSeq: 1 },
    ]);
  });

  it("passes windowCount and windowTabCount to window hooks", () => {
    const seen: { seq: number; windowCount: number; windowTabCount: number }[] = [];
    const probe: Transforms = {
      text: {
        windowStart: ({ seq, windowCount, windowTabCount }) => {
          seen.push({ seq, windowCount, windowTabCount });
          return "";
        },
        tab: () => "",
        tabDelimiter: "",
        windowDelimiter: "",
      },
    };
    render({ scope: "window", windows }, configured(probe));
    expect(seen).toEqual([
      { seq: 1, windowCount: 2, windowTabCount: 2 },
      { seq: 2, windowCount: 2, windowTabCount: 1 },
    ]);
  });

  it("renders the html channel across windows when present", () => {
    const result = render({ scope: "window", windows }, configured(linkTransforms));
    expect(result.html).toBe(
      'Window 1<br>\n<br>\n<a href="https://a.example.com/">Alpha</a><br>\n' +
        '<a href="https://b.example.com/">Beta</a><br>\n<br>\nWindow 2<br>\n<br>\n' +
        '<a href="https://c.example.com/">Gamma</a>',
    );
  });
});

describe("render — empty selection still renders start/end", () => {
  // Donor copy.ts:136-149 never short-circuits the assembly: an empty tabs array
  // still emits start?.()+''+end?.(). The console.warn is logging only (dropped here).
  it("fires start and end on an empty tab selection", () => {
    const probe: Transforms = {
      text: {
        start: ({ tabCount, scope }) => `[start tab=${tabCount} scope=${scope}]`,
        tab: ({ tab }) => tab.url,
        tabDelimiter: "\n",
        end: ({ tabCount }) => `[end tab=${tabCount}]`,
      },
    };
    const result = render({ scope: "tab", tabs: [] }, configured(probe));
    expect(result.text).toBe("[start tab=0 scope=tab][end tab=0]");
  });

  it("fires start and end on an empty window selection", () => {
    const probe: Transforms = {
      text: {
        start: ({ tabCount, windowCount, scope }) =>
          `[start tab=${tabCount} win=${windowCount} scope=${scope}]`,
        windowStart: ({ seq }) => `W${seq}`,
        tab: ({ tab }) => tab.url,
        tabDelimiter: "\n",
        windowDelimiter: "\n",
        end: ({ tabCount, windowCount }) => `[end tab=${tabCount} win=${windowCount}]`,
      },
    };
    const result = render({ scope: "window", windows: [] }, configured(probe));
    expect(result.text).toBe("[start tab=0 win=0 scope=window][end tab=0 win=0]");
  });
});
```

- [ ] **Step 2: Run it & expect FAIL.** From `apps/extension`:

```
bunx vitest run lib/copy/render.test.ts
```

Expected failure: the file `./render.ts` does not exist, so the import fails — message like `Failed to resolve import "./render.ts"` / `Cannot find module './render.ts'` (and no tests run / suite errors).

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/copy/render.ts` with the COMPLETE contents below.

```ts
import type { Transforms } from "./configured-format.ts";
import type { ConfiguredFormat } from "./configured-format.ts";
import type { Hooks } from "./format.ts";
import type { Rendered, ScopeSelection, TabLite, WindowLite } from "./types.ts";

// render() assembles a ConfiguredFormat's Hooks into a Rendered { text, html? }.
// Ported from tab-copy-master/src/copy.ts:93-222. text always renders; html only
// when transforms.html is present. Empty selections still fire start/end (no
// short-circuit) — matching the donor assembly.
export function render(selection: ScopeSelection, format: ConfiguredFormat): Rendered {
  const { label, transforms } = format;

  const result: Rendered = {
    text: applyChannel(selection, transforms.text, label),
  };

  if (transforms.html) {
    result.html = applyChannel(selection, transforms.html, label);
  }

  return result;
}

function applyChannel(selection: ScopeSelection, hooks: Hooks, formatName: string): string {
  return selection.scope === "tab"
    ? applyTabScope(selection.tabs, hooks, formatName)
    : applyWindowScope(selection.windows, hooks, formatName);
}

function applyTabScope(tabs: TabLite[], hooks: Hooks, formatName: string): string {
  const start = hooks.start?.({ formatName, tabCount: tabs.length, scope: "tab" }) ?? "";

  const body = tabs
    .map((tab, i) => hooks.tab({ tab, globalSeq: i + 1 }))
    .join(hooks.tabDelimiter ?? "");

  const end = hooks.end?.({ formatName, tabCount: tabs.length, scope: "tab" }) ?? "";

  return `${start}${body}${end}`;
}

function applyWindowScope(windows: WindowLite[], hooks: Hooks, formatName: string): string {
  const tabCount = windows.reduce((sum, w) => sum + w.tabs.length, 0);
  const windowCount = windows.length;

  const start =
    hooks.start?.({ formatName, tabCount, windowCount, scope: "window" }) ?? "";

  let globalSeq = 1;

  const body = windows
    .map((window, wi) => {
      const seq = wi + 1;
      const windowTabCount = window.tabs.length;

      const windowStart =
        hooks.windowStart?.({ window, seq, windowCount, windowTabCount }) ?? "";

      const tabsText = window.tabs
        .map((tab, ti) =>
          hooks.tab({
            tab,
            globalSeq: globalSeq++,
            windowTabSeq: ti + 1,
            windowSeq: seq,
            windowCount,
          }),
        )
        .join(hooks.tabDelimiter ?? "");

      const windowEnd =
        hooks.windowEnd?.({ window, seq, windowCount, windowTabCount }) ?? "";

      return `${windowStart}${tabsText}${windowEnd}`;
    })
    .join(hooks.windowDelimiter ?? "");

  const end = hooks.end?.({ formatName, tabCount, windowCount, scope: "window" }) ?? "";

  return `${start}${body}${end}`;
}
```

- [ ] **Step 4: Run it & expect PASS.** From `apps/extension`:

```
bunx vitest run lib/copy/render.test.ts
```

Expected: all tests pass (tab scope text-only + both channels + globalSeq; window scope grouping + globalSeq-across-windows + windowCount/windowTabCount + html; empty-selection-still-renders for both scopes).

- [ ] **Step 5: Commit.**

```
git add apps/extension/lib/copy/render.ts apps/extension/lib/copy/render.test.ts && git commit -m "feat(copy): add render walk assembling format hooks into Rendered"
```

---

## Module H — Entries + payload

Builds the structured per-tab record channel of the copy engine. `buildEntries` maps a `ScopeSelection` into a flat `TabRecord[]` carrying the engine-computed sequence numbers (`globalSeq`/`windowSeq`/`windowTabSeq`) plus `domain` (via `lib/domain.ts` `getDomain`), `favIconUrl`, `pinned`, `index`. `buildPayload` wraps those records into the scope-discriminated `CopyPayload`, attaching the optional `Rendered` string channel and — for window scope — both the per-window groups and the flattened entries that flat record sinks (sub-project B) consume.

Sequence-number semantics are derived from the donor's `applyTextTransformToWindows` in `tab-copy-master/src/copy.ts` (lines 176-205): `globalSeq` is a single continuous 1-based counter across all windows; `windowSeq` is 1-based per window (`wi + 1`); `windowTabSeq` is 1-based per tab within its window (`ti + 1`). For tab scope (donor `applyTextTransformToTabs`, line 143) only `globalSeq` (`i + 1`) is set — `windowSeq`/`windowTabSeq` are left `undefined`.

Dependencies: Module A (`lib/copy/types.ts` — `ScopeSelection`, `TabRecord`, `CopyPayload`, `Rendered`, `TabLite`, `WindowLite`) and Module G (`lib/copy/render.ts` — produces the `Rendered` value passed in; not imported here, only its output type is consumed). Both must already exist on the branch before this module is built.

---

### Task H1: buildEntries — flat TabRecord[] with sequence numbers + domain

- [ ] **Step 1: Write the failing test.** Create `lib/copy/entries.test.ts` with the complete test below.

```ts
import { describe, expect, it } from "vitest";

import { buildEntries } from "./entries.ts";
import type { ScopeSelection, TabLite, WindowLite } from "@/lib/copy/types.ts";

function tab(over: Partial<TabLite> & { id: number }): TabLite {
  return {
    id: over.id,
    url: over.url ?? `https://example.com/${over.id}`,
    title: over.title ?? `Tab ${over.id}`,
    index: over.index ?? 0,
    pinned: over.pinned ?? false,
    favIconUrl: over.favIconUrl,
    highlighted: over.highlighted,
  };
}

describe("buildEntries (tab scope)", () => {
  it("maps each tab to a record with a continuous 1-based globalSeq and no window seqs", () => {
    const selection: ScopeSelection = {
      scope: "tab",
      tabs: [
        tab({ id: 1, url: "https://docs.example.com/a", title: "Alpha", index: 0, pinned: true }),
        tab({ id: 2, url: "https://github.com/x", title: "Beta", index: 1 }),
      ],
    };

    expect(buildEntries(selection)).toEqual([
      {
        title: "Alpha",
        url: "https://docs.example.com/a",
        favIconUrl: undefined,
        domain: "docs.example.com",
        pinned: true,
        index: 0,
        globalSeq: 1,
      },
      {
        title: "Beta",
        url: "https://github.com/x",
        favIconUrl: undefined,
        domain: "github.com",
        pinned: false,
        index: 1,
        globalSeq: 2,
      },
    ]);
  });

  it("preserves favIconUrl and derives domain via getDomain for special schemes", () => {
    const selection: ScopeSelection = {
      scope: "tab",
      tabs: [
        tab({ id: 1, url: "chrome://settings", title: "Settings", favIconUrl: "https://i/c.png" }),
      ],
    };

    const [entry] = buildEntries(selection);

    expect(entry?.favIconUrl).toBe("https://i/c.png");
    expect(entry?.domain).toBe("(chrome)");
  });

  it("returns an empty array for an empty tab selection", () => {
    const selection: ScopeSelection = { scope: "tab", tabs: [] };

    expect(buildEntries(selection)).toEqual([]);
  });
});

describe("buildEntries (window scope)", () => {
  it("continues globalSeq across windows and resets windowTabSeq per window", () => {
    const windows: WindowLite[] = [
      {
        id: 10,
        tabs: [tab({ id: 1, title: "W1T1", index: 0 }), tab({ id: 2, title: "W1T2", index: 1 })],
      },
      { id: 11, tabs: [tab({ id: 3, title: "W2T1", index: 0 })] },
    ];
    const selection: ScopeSelection = { scope: "window", windows };

    expect(buildEntries(selection)).toEqual([
      {
        title: "W1T1",
        url: "https://example.com/1",
        favIconUrl: undefined,
        domain: "example.com",
        pinned: false,
        index: 0,
        windowSeq: 1,
        windowTabSeq: 1,
        globalSeq: 1,
      },
      {
        title: "W1T2",
        url: "https://example.com/2",
        favIconUrl: undefined,
        domain: "example.com",
        pinned: false,
        index: 1,
        windowSeq: 1,
        windowTabSeq: 2,
        globalSeq: 2,
      },
      {
        title: "W2T1",
        url: "https://example.com/3",
        favIconUrl: undefined,
        domain: "example.com",
        pinned: false,
        index: 0,
        windowSeq: 2,
        windowTabSeq: 1,
        globalSeq: 3,
      },
    ]);
  });

  it("returns an empty array when all windows are empty", () => {
    const selection: ScopeSelection = {
      scope: "window",
      windows: [{ id: 10, tabs: [] }],
    };

    expect(buildEntries(selection)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `bunx vitest run lib/copy/entries.test.ts` from `apps/extension`. Expect failure resolving the import: `Failed to load url ./entries.ts` (or `Cannot find module './entries.ts'`) — the file does not exist yet.

- [ ] **Step 3: Write the minimal implementation.** Create `lib/copy/entries.ts` with the complete code below.

```ts
import { getDomain } from "@/lib/domain.ts";
import type { ScopeSelection, TabLite, TabRecord } from "@/lib/copy/types.ts";

function toRecord(
  tab: TabLite,
  globalSeq: number,
  windowSeq?: number,
  windowTabSeq?: number,
): TabRecord {
  return {
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    domain: getDomain(tab.url),
    pinned: tab.pinned,
    index: tab.index,
    ...(windowSeq === undefined ? null : { windowSeq }),
    ...(windowTabSeq === undefined ? null : { windowTabSeq }),
    globalSeq,
  };
}

export function buildEntries(selection: ScopeSelection): TabRecord[] {
  // Mirrors donor seq semantics (tab-copy-master/src/copy.ts):
  // tab scope -> globalSeq = i + 1 (applyTextTransformToTabs);
  // window scope -> continuous globalSeq, windowSeq = wi + 1, windowTabSeq = ti + 1.
  if (selection.scope === "tab") {
    return selection.tabs.map((tab, i) => toRecord(tab, i + 1));
  }

  const entries: TabRecord[] = [];
  let globalSeq = 1;

  selection.windows.forEach((window, wi) => {
    window.tabs.forEach((tab, ti) => {
      entries.push(toRecord(tab, globalSeq, wi + 1, ti + 1));
      globalSeq += 1;
    });
  });

  return entries;
}
```

- [ ] **Step 4: Run it and expect PASS.** Run `bunx vitest run lib/copy/entries.test.ts` from `apps/extension`. Expect all tests in both `describe` blocks to pass.

- [ ] **Step 5: Commit.** Run:
```
git add apps/extension/lib/copy/entries.ts apps/extension/lib/copy/entries.test.ts && git commit -m "feat(copy): add buildEntries for structured tab records"
```

---

### Task H2: buildPayload — scope-discriminated CopyPayload with rendered passthrough

- [ ] **Step 1: Write the failing test.** Create `lib/copy/payload.test.ts` with the complete test below.

```ts
import { describe, expect, it } from "vitest";

import { buildPayload } from "./payload.ts";
import type { Rendered, ScopeSelection, TabLite, WindowLite } from "@/lib/copy/types.ts";

function tab(over: Partial<TabLite> & { id: number }): TabLite {
  return {
    id: over.id,
    url: over.url ?? `https://example.com/${over.id}`,
    title: over.title ?? `Tab ${over.id}`,
    index: over.index ?? 0,
    pinned: over.pinned ?? false,
    favIconUrl: over.favIconUrl,
    highlighted: over.highlighted,
  };
}

describe("buildPayload (tab scope)", () => {
  it("produces a tab-discriminated payload carrying the flat entries", () => {
    const selection: ScopeSelection = {
      scope: "tab",
      tabs: [tab({ id: 1, url: "https://a.com/", title: "A" })],
    };

    expect(buildPayload(selection)).toEqual({
      scope: "tab",
      entries: [
        {
          title: "A",
          url: "https://a.com/",
          favIconUrl: undefined,
          domain: "a.com",
          pinned: false,
          index: 0,
          globalSeq: 1,
        },
      ],
    });
  });

  it("attaches the rendered channel when provided", () => {
    const selection: ScopeSelection = { scope: "tab", tabs: [tab({ id: 1 })] };
    const rendered: Rendered = { text: "https://example.com/1", html: "<a>...</a>" };

    const payload = buildPayload(selection, rendered);

    expect(payload.rendered).toEqual(rendered);
  });

  it("omits rendered when not provided", () => {
    const selection: ScopeSelection = { scope: "tab", tabs: [tab({ id: 1 })] };

    expect(buildPayload(selection).rendered).toBeUndefined();
  });
});

describe("buildPayload (window scope)", () => {
  it("groups entries by window and also flattens them", () => {
    const windows: WindowLite[] = [
      { id: 10, tabs: [tab({ id: 1, title: "W1T1" }), tab({ id: 2, title: "W1T2" })] },
      { id: 11, tabs: [tab({ id: 3, title: "W2T1" })] },
    ];
    const selection: ScopeSelection = { scope: "window", windows };

    const payload = buildPayload(selection);

    if (payload.scope !== "window") {
      throw new Error("expected window-scoped payload");
    }

    expect(payload.windows).toEqual([
      { windowSeq: 1, entries: [expect.objectContaining({ globalSeq: 1, windowSeq: 1, windowTabSeq: 1 }), expect.objectContaining({ globalSeq: 2, windowSeq: 1, windowTabSeq: 2 })] },
      { windowSeq: 2, entries: [expect.objectContaining({ globalSeq: 3, windowSeq: 2, windowTabSeq: 1 })] },
    ]);
    expect(payload.entries.map((e) => e.globalSeq)).toEqual([1, 2, 3]);
  });

  it("drops empty windows from windows[] and keeps flattened entries empty", () => {
    const selection: ScopeSelection = {
      scope: "window",
      windows: [{ id: 10, tabs: [] }],
    };

    const payload = buildPayload(selection);

    if (payload.scope !== "window") {
      throw new Error("expected window-scoped payload");
    }

    expect(payload.windows).toEqual([]);
    expect(payload.entries).toEqual([]);
  });

  it("attaches the rendered channel for window scope", () => {
    const selection: ScopeSelection = {
      scope: "window",
      windows: [{ id: 10, tabs: [tab({ id: 1 })] }],
    };
    const rendered: Rendered = { text: "Window 1\nhttps://example.com/1" };

    expect(buildPayload(selection, rendered).rendered).toEqual(rendered);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `bunx vitest run lib/copy/payload.test.ts` from `apps/extension`. Expect failure resolving the import: `Failed to load url ./payload.ts` (or `Cannot find module './payload.ts'`) — the file does not exist yet.

- [ ] **Step 3: Write the minimal implementation.** Create `lib/copy/payload.ts` with the complete code below.

```ts
import { buildEntries } from "@/lib/copy/entries.ts";
import type { CopyPayload, Rendered, ScopeSelection, TabRecord } from "@/lib/copy/types.ts";

export function buildPayload(selection: ScopeSelection, rendered?: Rendered): CopyPayload {
  const entries = buildEntries(selection);

  if (selection.scope === "tab") {
    return { scope: "tab", entries, ...(rendered === undefined ? null : { rendered }) };
  }

  // Group the flattened entries back by windowSeq; empty windows produce no
  // group because they contribute no entries (mirrors donor empty-window drop).
  const groups = new Map<number, TabRecord[]>();
  for (const entry of entries) {
    const seq = entry.windowSeq;
    if (seq === undefined) {
      continue;
    }
    const list = groups.get(seq) ?? [];
    list.push(entry);
    groups.set(seq, list);
  }

  const windows = [...groups.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([windowSeq, windowEntries]) => ({ windowSeq, entries: windowEntries }));

  return {
    scope: "window",
    windows,
    entries,
    ...(rendered === undefined ? null : { rendered }),
  };
}
```

- [ ] **Step 4: Run it and expect PASS.** Run `bunx vitest run lib/copy/payload.test.ts` from `apps/extension`. Expect all tests in both `describe` blocks to pass. Also run `bun run test` to confirm the full suite stays green.

- [ ] **Step 5: Commit.** Run:
```
git add apps/extension/lib/copy/payload.ts apps/extension/lib/copy/payload.test.ts && git commit -m "feat(copy): add buildPayload for scope-discriminated copy payload"
```

---

## Module I — Sinks (clipboard + file download)

Establishes the **Sink seam** (`§4.1`, `§4.2`): one method `consume(payload: CopyPayload): Promise<void>`. String sinks read `payload.rendered`; record sinks (sub-project B) read `entries`/`windows`. Two sinks ship in M1: `ClipboardSink` (delegates to the Module J navigator-clipboard adapter) and `FileSink` (derives `{filename, mimeType}` from the chosen format and triggers a browser download). The existing `lib/export.ts` is refactored to live behind `FileSink` — donor-parity Markdown is canonical; the old domain-grouped Markdown is demoted, not deleted (DEVIATION #7).

Depends on: A (`lib/copy/types.ts` — `CopyPayload`, `Rendered`), H (`buildPayload`), J (`lib/clipboard/navigator-clipboard.ts` — `writeToClipboard`).

> **Stub note for J:** Module J ships `writeToClipboard(rendered: Rendered): Promise<void>`. If J is not yet merged when this task runs, create the minimal real adapter `lib/clipboard/navigator-clipboard.ts` shown in Task I2-Step3 so `ClipboardSink` has a typed dependency; J replaces/owns its full body later. Do NOT mock the module under test.

File-derivation parity is sourced from the **target** `lib/export.ts` (donor `tab-copy-master/src` has no file-download path — it is clipboard-only; the file sink is target-native) and from donor mime usage (`tab-copy-master/src/util/clipboard.ts` uses `text/plain` and `text/html`).

---

### Task I1: FileSink filename/mime derivation (pure)

The pure heart of `FileSink`: given a `FormatId` + tab count, derive `{ filename, mimeType, extension }`. This is the only logic-bearing part of the file sink and gets the full golden-string suite. The download trigger (Blob + `URL.createObjectURL` + anchor click) is a thin wrapper added in Task I3 with a smoke test.

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/sinks/file-meta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveFileMeta } from "./file-meta.ts";

describe("deriveFileMeta — extension per format", () => {
  // Parity source: target lib/export.ts mapped markdown -> "md"/"text/markdown".
  it("markdown -> md / text/markdown", () => {
    expect(deriveFileMeta("markdown", 3)).toMatchObject({
      extension: "md",
      mimeType: "text/markdown",
    });
  });

  // csv is a tabular text format; .csv / text/csv is the conventional pairing.
  it("csv -> csv / text/csv", () => {
    expect(deriveFileMeta("csv", 3)).toMatchObject({
      extension: "csv",
      mimeType: "text/csv",
    });
  });

  // json format (donor format.ts id 'json') -> .json / application/json.
  it("json -> json / application/json", () => {
    expect(deriveFileMeta("json", 3)).toMatchObject({
      extension: "json",
      mimeType: "application/json",
    });
  });

  // htmlTable + html render to markup; donor clipboard.ts uses the text/html mime.
  it("htmlTable -> html / text/html", () => {
    expect(deriveFileMeta("htmlTable", 3)).toMatchObject({
      extension: "html",
      mimeType: "text/html",
    });
  });

  it("html -> html / text/html", () => {
    expect(deriveFileMeta("html", 3)).toMatchObject({
      extension: "html",
      mimeType: "text/html",
    });
  });

  // All other text-channel builtins fall back to plain text (.txt / text/plain),
  // matching the donor's text/plain clipboard channel.
  it.each(["link", "url", "titleUrl1Line", "titleUrl2Line", "title", "bbcode"] as const)(
    "%s -> txt / text/plain",
    (id) => {
      expect(deriveFileMeta(id, 3)).toMatchObject({
        extension: "txt",
        mimeType: "text/plain",
      });
    },
  );

  // Custom formats are arbitrary text templates -> default to txt / text/plain.
  it("custom-* -> txt / text/plain", () => {
    expect(deriveFileMeta("custom-abc123", 3)).toMatchObject({
      extension: "txt",
      mimeType: "text/plain",
    });
  });
});

describe("deriveFileMeta — filename", () => {
  it("builds a tabs-<count>.<ext> filename", () => {
    expect(deriveFileMeta("markdown", 3).filename).toBe("tabs-3.md");
  });

  it("singular-safe for one tab", () => {
    expect(deriveFileMeta("csv", 1).filename).toBe("tabs-1.csv");
  });

  it("handles zero tabs", () => {
    expect(deriveFileMeta("url", 0).filename).toBe("tabs-0.txt");
  });
});
```

- [ ] **Step 2: Run it & expect FAIL.** `cd apps/extension && bunx vitest run lib/sinks/file-meta.test.ts` — expect failure: `Cannot find module './file-meta.ts'` (or `deriveFileMeta is not a function`).

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/sinks/file-meta.ts`:

```ts
import type { FormatId } from "@/lib/copy/format.ts";

export interface FileMeta {
  filename: string;
  extension: string;
  mimeType: string;
}

// Target-native derivation (donor is clipboard-only). Extension/mime map ports
// the target lib/export.ts pairing (markdown -> md/text/markdown) and extends it
// to the full builtin format set. Markup formats use the donor's text/html mime
// (tab-copy-master/src/util/clipboard.ts); everything else defaults to plain text.
function metaForFormat(id: FormatId): { extension: string; mimeType: string } {
  if (id === "markdown") return { extension: "md", mimeType: "text/markdown" };
  if (id === "csv") return { extension: "csv", mimeType: "text/csv" };
  if (id === "json") return { extension: "json", mimeType: "application/json" };
  if (id === "html" || id === "htmlTable") return { extension: "html", mimeType: "text/html" };
  return { extension: "txt", mimeType: "text/plain" };
}

export function deriveFileMeta(id: FormatId, tabCount: number): FileMeta {
  const { extension, mimeType } = metaForFormat(id);

  return {
    filename: `tabs-${tabCount}.${extension}`,
    extension,
    mimeType,
  };
}
```

> If `@/lib/copy/format.ts` (Module D) is not yet merged, temporarily type `id` as `string` and add `// TODO(D): import FormatId once format.ts lands` — but prefer importing the real `FormatId`. Do not invent a local copy of the union.

- [ ] **Step 4: Run & expect PASS.** `cd apps/extension && bunx vitest run lib/sinks/file-meta.test.ts` — all green.

- [ ] **Step 5: Commit.** `cd apps/extension && git add lib/sinks/file-meta.ts lib/sinks/file-meta.test.ts && git commit -m "feat(copy): derive file sink filename and mime from format id"`

---

### Task I2: Sink interface + ClipboardSink

Defines the seam contract and the first sink. `ClipboardSink` is a thin delegate to Module J's `writeToClipboard`; its test verifies it forwards `payload.rendered` and no-ops cleanly when `rendered` is absent.

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/sinks/clipboard-sink.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { CopyPayload, Rendered } from "@/lib/copy/types.ts";

vi.mock("@/lib/clipboard/navigator-clipboard.ts", () => ({
  writeToClipboard: vi.fn(async (_rendered: Rendered) => {}),
}));

import { writeToClipboard } from "@/lib/clipboard/navigator-clipboard.ts";
import { ClipboardSink } from "./clipboard-sink.ts";

const rendered: Rendered = { text: "https://example.com/", html: "<a>x</a>" };

const tabPayload: CopyPayload = {
  scope: "tab",
  entries: [{ title: "Example", url: "https://example.com/", globalSeq: 1 }],
  rendered,
};

describe("ClipboardSink", () => {
  it("forwards payload.rendered to the navigator-clipboard adapter", async () => {
    const sink = new ClipboardSink();
    await sink.consume(tabPayload);
    expect(writeToClipboard).toHaveBeenCalledWith(rendered);
  });

  it("throws when the payload has no rendered channel (string sinks require it)", async () => {
    const sink = new ClipboardSink();
    const noRender: CopyPayload = { scope: "tab", entries: [] };
    await expect(sink.consume(noRender)).rejects.toThrow(/rendered/i);
  });
});
```

- [ ] **Step 2: Run it & expect FAIL.** `cd apps/extension && bunx vitest run lib/sinks/clipboard-sink.test.ts` — expect failure: `Cannot find module './clipboard-sink.ts'`.

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/sinks/sink.ts`:

```ts
import type { CopyPayload } from "@/lib/copy/types.ts";

// The core seam (spec §4.2): one method. String sinks read payload.rendered;
// record sinks (sub-project B) read payload.entries / payload.windows.
export interface Sink {
  consume(payload: CopyPayload): Promise<void>;
}
```

If `lib/clipboard/navigator-clipboard.ts` does not yet exist (Module J), create it minimally so the import resolves:

```ts
// apps/extension/lib/clipboard/navigator-clipboard.ts
import type { Rendered } from "@/lib/copy/types.ts";

// Popup (focusable) write path (spec §4.3). Module J owns the full body
// (ClipboardItem text/plain + text/html). Background path is the offscreen client.
export async function writeToClipboard(rendered: Rendered): Promise<void> {
  const items: Record<string, Blob> = {
    "text/plain": new Blob([rendered.text], { type: "text/plain" }),
  };

  if (rendered.html !== undefined) {
    items["text/html"] = new Blob([rendered.html], { type: "text/html" });
  }

  await navigator.clipboard.write([new ClipboardItem(items)]);
}
```

Then create `apps/extension/lib/sinks/clipboard-sink.ts`:

```ts
import { writeToClipboard } from "@/lib/clipboard/navigator-clipboard.ts";
import type { CopyPayload } from "@/lib/copy/types.ts";
import type { Sink } from "./sink.ts";

export class ClipboardSink implements Sink {
  async consume(payload: CopyPayload): Promise<void> {
    if (payload.rendered === undefined) {
      throw new Error("ClipboardSink requires a rendered payload");
    }

    await writeToClipboard(payload.rendered);
  }
}
```

- [ ] **Step 4: Run & expect PASS.** `cd apps/extension && bunx vitest run lib/sinks/clipboard-sink.test.ts` — all green.

- [ ] **Step 5: Commit.** `cd apps/extension && git add lib/sinks/sink.ts lib/sinks/clipboard-sink.ts lib/sinks/clipboard-sink.test.ts lib/clipboard/navigator-clipboard.ts && git commit -m "feat(copy): add Sink interface and ClipboardSink"`

---

### Task I3: FileSink + refactor export.ts behind it

`FileSink` composes Task I1's `deriveFileMeta` with a download trigger and implements `Sink`. The download mechanism (Blob → `URL.createObjectURL` → anchor click → `revokeObjectURL`) is injected so it stays testable. `lib/export.ts` keeps its current `buildUrlExport` (domain-grouped Markdown) but is re-pointed: its content/extension/mime is now reached **through** `FileSink`, and the donor-parity Markdown produced by Module G's `render()` is what `FileSink` writes by default (DEVIATION #7 — the domain-grouped Markdown is demoted to a future opt, not the default).

- [ ] **Step 1: Write the failing test.** Create `apps/extension/lib/sinks/file-download-sink.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { CopyPayload } from "@/lib/copy/types.ts";
import { FileSink } from "./file-download-sink.ts";

const payload: CopyPayload = {
  scope: "tab",
  entries: [
    { title: "Example", url: "https://example.com/", globalSeq: 1 },
    { title: "GitHub", url: "https://github.com/", globalSeq: 2 },
  ],
  rendered: { text: "https://example.com/\nhttps://github.com/" },
};

describe("FileSink", () => {
  it("downloads with a format-derived filename and mime", async () => {
    const triggered: { blob: Blob; filename: string }[] = [];
    const sink = new FileSink("markdown", {
      triggerDownload: async (blob, filename) => {
        triggered.push({ blob, filename });
      },
    });

    await sink.consume(payload);

    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.filename).toBe("tabs-2.md");
    expect(triggered[0]!.blob.type).toBe("text/markdown");
    expect(await triggered[0]!.blob.text()).toBe(
      "https://example.com/\nhttps://github.com/",
    );
  });

  it("derives a .txt download for plain-text formats", async () => {
    const triggered: { blob: Blob; filename: string }[] = [];
    const sink = new FileSink("url", {
      triggerDownload: async (blob, filename) => {
        triggered.push({ blob, filename });
      },
    });

    await sink.consume(payload);

    expect(triggered[0]!.filename).toBe("tabs-2.txt");
    expect(triggered[0]!.blob.type).toBe("text/plain");
  });

  it("throws when the payload has no rendered text", async () => {
    const sink = new FileSink("markdown", {
      triggerDownload: vi.fn(),
    });
    const noRender: CopyPayload = { scope: "tab", entries: [] };
    await expect(sink.consume(noRender)).rejects.toThrow(/rendered/i);
  });
});
```

- [ ] **Step 2: Run it & expect FAIL.** `cd apps/extension && bunx vitest run lib/sinks/file-download-sink.test.ts` — expect failure: `Cannot find module './file-download-sink.ts'`.

- [ ] **Step 3: Write the minimal implementation.** Create `apps/extension/lib/sinks/file-download-sink.ts`:

```ts
import type { FormatId } from "@/lib/copy/format.ts";
import type { CopyPayload } from "@/lib/copy/types.ts";
import { deriveFileMeta } from "./file-meta.ts";
import type { Sink } from "./sink.ts";

// Injected so the pure derivation is unit-testable without a DOM. The default
// uses the browser download path (Blob URL + transient anchor click).
export type TriggerDownload = (blob: Blob, filename: string) => Promise<void>;

const defaultTriggerDownload: TriggerDownload = async (blob, filename) => {
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export interface FileSinkDeps {
  triggerDownload?: TriggerDownload;
}

// DEVIATION #7: donor-parity render() output (payload.rendered.text) is the
// canonical file content. The legacy domain-grouped Markdown in lib/export.ts is
// demoted to a future opt and is no longer the default file body.
export class FileSink implements Sink {
  private readonly triggerDownload: TriggerDownload;

  constructor(
    private readonly formatId: FormatId,
    deps: FileSinkDeps = {},
  ) {
    this.triggerDownload = deps.triggerDownload ?? defaultTriggerDownload;
  }

  async consume(payload: CopyPayload): Promise<void> {
    if (payload.rendered === undefined) {
      throw new Error("FileSink requires a rendered payload");
    }

    const tabCount = payload.entries.length;
    const { filename, mimeType } = deriveFileMeta(this.formatId, tabCount);
    const blob = new Blob([payload.rendered.text], { type: mimeType });

    await this.triggerDownload(blob, filename);
  }
}
```

- [ ] **Step 4: Run & expect PASS.** `cd apps/extension && bunx vitest run lib/sinks/file-download-sink.test.ts` — all green.

- [ ] **Step 5: Re-point export.ts (keep legacy behind a comment, run its existing suite).** Add a deprecation note at the top of `apps/extension/lib/export.ts` so the demotion (DEVIATION #7) is discoverable, without changing `buildUrlExport`'s behavior (its tests must stay green):

```ts
// DEVIATION #7 (spec §9): buildUrlExport's domain-grouped Markdown/text is now
// LEGACY. The canonical file path is FileSink (lib/sinks/file-download-sink.ts),
// which writes Module G render() output. This grouped variant is retained as a
// future format opt and is no longer the default download body.
```

Run the full suite to confirm nothing regressed: `cd apps/extension && bun run test` — all green (existing `export.test.ts`, `file-meta`, `clipboard-sink`, `file-download-sink`).

- [ ] **Step 6: Commit.** `cd apps/extension && git add lib/sinks/file-download-sink.ts lib/sinks/file-download-sink.test.ts lib/export.ts && git commit -m "feat(copy): add FileSink and route file downloads behind the Sink seam (DEVIATION #7)"`

---

### Task J: Clipboard write (popup path)

Module J ports the donor's popup clipboard write (`tab-copy-master/src/util/clipboard.ts` → `clipboardWrite`). We split it into a **pure** mime-map builder (`buildClipboardItem`) that is fully unit-testable, and a thin **adapter** (`writeToClipboard`) that turns that map into real `Blob`/`ClipboardItem` objects and calls `navigator.clipboard.write`. The `nxs` web custom format is dropped (DEVIATION #3). All imports use explicit `.ts` extensions and the `@/lib/...` alias; tests live next to source.

Depends on Module A (`lib/copy/types.ts` providing `Rendered`).

- [ ] **Step 1: Write the failing test for the pure builder.**
  Create `apps/extension/lib/clipboard/clipboard-item.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";

  import { buildClipboardItem } from "./clipboard-item.ts";

  describe("buildClipboardItem", () => {
    it("always includes a text/plain entry", () => {
      // Donor clipboardWrite always writes 'text/plain': new Blob([text]).
      expect(buildClipboardItem({ text: "hello" })).toEqual([
        { mimeType: "text/plain", data: "hello" },
      ]);
    });

    it("adds a text/html entry when html is present", () => {
      // Donor adds 'text/html': new Blob([html]) only when `html` is truthy.
      expect(
        buildClipboardItem({ text: "hello", html: "<a>hello</a>" }),
      ).toEqual([
        { mimeType: "text/plain", data: "hello" },
        { mimeType: "text/html", data: "<a>hello</a>" },
      ]);
    });

    it("omits text/html when html is an empty string", () => {
      // Donor's `...(html ? {...} : null)` treats "" as falsy → no html part.
      expect(buildClipboardItem({ text: "x", html: "" })).toEqual([
        { mimeType: "text/plain", data: "x" },
      ]);
    });

    it("preserves text/plain before text/html ordering", () => {
      const parts = buildClipboardItem({ text: "t", html: "<b>t</b>" });
      expect(parts.map((p) => p.mimeType)).toEqual(["text/plain", "text/html"]);
    });
  });
  ```

- [ ] **Step 2: Run the test and expect FAIL.**
  From `apps/extension`: `bunx vitest run lib/copy/../clipboard/clipboard-item.test.ts`
  (equivalently `bunx vitest run lib/clipboard/clipboard-item.test.ts`).
  Expected failure: `Failed to resolve import "./clipboard-item.ts"` / `buildClipboardItem is not a function` — the module does not exist yet.

- [ ] **Step 3: Write the minimal implementation of the pure builder.**
  Create `apps/extension/lib/clipboard/clipboard-item.ts`:
  ```ts
  import type { Rendered } from "@/lib/copy/types.ts";

  // A pure description of one clipboard representation: a mime type mapped to its
  // string payload. The adapter (navigator-clipboard.ts) turns these into Blobs.
  export interface ClipboardPart {
    mimeType: string;
    data: string;
  }

  // Mirrors the donor's `clipboardWrite` mime map (text/plain always; text/html
  // only when html is present), minus the dropped nxs web custom format.
  export function buildClipboardItem(rendered: Rendered): ClipboardPart[] {
    const parts: ClipboardPart[] = [{ mimeType: "text/plain", data: rendered.text }];
    if (rendered.html) {
      parts.push({ mimeType: "text/html", data: rendered.html });
    }
    return parts;
  }
  ```

- [ ] **Step 4: Run the test and expect PASS.**
  From `apps/extension`: `bunx vitest run lib/clipboard/clipboard-item.test.ts`
  Expected: all 4 tests pass.

- [ ] **Step 5: Commit.**
  ```
  git add apps/extension/lib/clipboard/clipboard-item.ts apps/extension/lib/clipboard/clipboard-item.test.ts && git commit -m "feat(copy): add pure buildClipboardItem mime-map builder"
  ```

- [ ] **Step 6: Write the failing adapter smoke test.**
  Create `apps/extension/lib/clipboard/navigator-clipboard.test.ts`. It stubs the global `ClipboardItem`, `Blob`, and `navigator.clipboard.write` so the focused popup path can run under Vitest's jsdom-free environment:
  ```ts
  import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

  import { writeToClipboard } from "./navigator-clipboard.ts";

  // Capture what the adapter hands to ClipboardItem / navigator.clipboard.write.
  class FakeBlob {
    constructor(
      public parts: string[],
      public options: { type: string },
    ) {}
  }

  class FakeClipboardItem {
    constructor(public items: Record<string, unknown>) {}
  }

  const write = vi.fn<(items: unknown[]) => Promise<void>>();

  beforeEach(() => {
    write.mockReset();
    write.mockResolvedValue(undefined);
    vi.stubGlobal("Blob", FakeBlob);
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("writeToClipboard", () => {
    it("writes a single ClipboardItem with a text/plain Blob", async () => {
      await writeToClipboard({ text: "hello" });

      expect(write).toHaveBeenCalledTimes(1);
      const items = write.mock.calls[0]![0] as FakeClipboardItem[];
      expect(items).toHaveLength(1);
      const blob = items[0]!.items["text/plain"] as FakeBlob;
      expect(blob.parts).toEqual(["hello"]);
      expect(blob.options).toEqual({ type: "text/plain" });
      expect(items[0]!.items["text/html"]).toBeUndefined();
    });

    it("includes a text/html Blob when html is present", async () => {
      await writeToClipboard({ text: "hello", html: "<a>hello</a>" });

      const items = write.mock.calls[0]![0] as FakeClipboardItem[];
      const htmlBlob = items[0]!.items["text/html"] as FakeBlob;
      expect(htmlBlob.parts).toEqual(["<a>hello</a>"]);
      expect(htmlBlob.options).toEqual({ type: "text/html" });
    });

    it("propagates write rejection to the caller", async () => {
      write.mockRejectedValueOnce(new Error("denied"));

      await expect(writeToClipboard({ text: "x" })).rejects.toThrow("denied");
    });
  });
  ```

- [ ] **Step 7: Run the adapter test and expect FAIL.**
  From `apps/extension`: `bunx vitest run lib/clipboard/navigator-clipboard.test.ts`
  Expected failure: `Failed to resolve import "./navigator-clipboard.ts"` / `writeToClipboard is not a function` — the adapter does not exist yet.

- [ ] **Step 8: Write the minimal adapter implementation.**
  Create `apps/extension/lib/clipboard/navigator-clipboard.ts`. It reuses the pure builder and constructs real `Blob`/`ClipboardItem` objects (donor parity: one `ClipboardItem`, Blobs typed per mime):
  ```ts
  import type { Rendered } from "@/lib/copy/types.ts";

  import { buildClipboardItem } from "./clipboard-item.ts";

  // Popup / focused-document write path only. The service worker must NOT call
  // this — navigator.clipboard.write fails silently when unfocused (see design
  // §4.3); the background path goes through the offscreen client (Module M2).
  export async function writeToClipboard(rendered: Rendered): Promise<void> {
    const parts = buildClipboardItem(rendered);

    const items: Record<string, Blob> = {};
    for (const part of parts) {
      items[part.mimeType] = new Blob([part.data], { type: part.mimeType });
    }

    await navigator.clipboard.write([new ClipboardItem(items)]);
  }
  ```

- [ ] **Step 9: Run the adapter test and expect PASS.**
  From `apps/extension`: `bunx vitest run lib/clipboard/navigator-clipboard.test.ts`
  Expected: all 3 tests pass.

- [ ] **Step 10: Commit.**
  ```
  git add apps/extension/lib/clipboard/navigator-clipboard.ts apps/extension/lib/clipboard/navigator-clipboard.test.ts && git commit -m "feat(copy): add navigator-clipboard popup write adapter"
  ```

---

### Task K: getScopeSnapshot scope snapshot adapter

Adds `getScopeSnapshot(): Promise<ScopeSnapshot>` to the existing `lib/tabs-service.ts` adapter, plus the two optional `TabLite` fields (`favIconUrl`, `highlighted`) the snapshot carries. The snapshot is the single Chrome read that Module C's `selectScope()` consumes. Mirrors the donor's two reads: `chrome.windows.getAll({ populate: true })` for all windows + tabs (donor `getWindowsAndTabs`) and `chrome.tabs.query({ currentWindow: true })` filtered to `highlighted` for the highlighted ids (donor `getTabs` highlighted branch). No filtering happens here — `selectScope` (Module C) owns the pinned filter; the snapshot is raw.

Depends on Module A having created `apps/extension/lib/copy/types.ts` exporting `ScopeSnapshot`, `WindowLite`, `TabLite`. The canonical `TabLite` adds `favIconUrl?`/`highlighted?` there; this task also widens the legacy `apps/extension/lib/types.ts` `TabLite` (used by the existing sort path) with the same two optional fields so the one shared interface stays in sync. Existing `tabs-service` functions (`getCurrentWindowTabs`, `applyOrder`, `moveTabsToNewWindow`) stay intact.

- [ ] **Step 1: Widen `TabLite` in `lib/types.ts` — write the failing test.**

  Extend the import at the top of `apps/extension/lib/tabs-service.test.ts`:

  ```ts
  // apps/extension/lib/tabs-service.test.ts — replace existing import line
  import {
    applyOrder,
    getCurrentWindowTabs,
    getScopeSnapshot,
    moveTabsToNewWindow,
  } from "./tabs-service.ts";
  ```

  Add a `getWindowsAll` mock alongside the existing mocks and stub it on `browser.windows`:

  ```ts
  // apps/extension/lib/tabs-service.test.ts — add near the other vi.fn() decls
  const getWindowsAll = vi.fn();
  ```

  ```ts
  // apps/extension/lib/tabs-service.test.ts — in beforeEach, replace the stubGlobal block
  getWindowsAll.mockReset();
  vi.stubGlobal("browser", {
    tabs: { query, move },
    windows: { create, getAll: getWindowsAll },
  });
  ```

  Append the snapshot tests inside `describe("tabs service")`:

  ```ts
  // apps/extension/lib/tabs-service.test.ts — append inside describe("tabs service")
  describe("getScopeSnapshot", () => {
    it("maps windows.getAll into WindowLite[] with favIconUrl and highlighted", async () => {
      // windows.getAll({ populate: true }) mirrors donor getWindowsAndTabs
      getWindowsAll.mockResolvedValue([
        {
          id: 10,
          tabs: [
            {
              id: 1,
              url: "https://a.test",
              title: "A",
              index: 0,
              pinned: true,
              favIconUrl: "https://a.test/favicon.ico",
              highlighted: false,
            },
            {
              id: 2,
              url: "https://b.test",
              title: "B",
              index: 1,
              pinned: false,
              highlighted: true,
            },
          ],
        },
        {
          id: 20,
          tabs: [{ id: 3, url: "https://c.test", title: "C", index: 0, pinned: false }],
        },
      ]);
      // tabs.query({ highlighted: true, currentWindow: true }) -> donor highlighted branch
      query.mockResolvedValue([{ id: 2, windowId: 10 }]);

      const snapshot = await getScopeSnapshot();

      expect(getWindowsAll).toHaveBeenCalledWith({ populate: true });
      expect(query).toHaveBeenCalledWith({ highlighted: true, currentWindow: true });
      expect(snapshot).toEqual({
        windows: [
          {
            id: 10,
            tabs: [
              {
                id: 1,
                url: "https://a.test",
                title: "A",
                index: 0,
                pinned: true,
                favIconUrl: "https://a.test/favicon.ico",
                highlighted: false,
              },
              {
                id: 2,
                url: "https://b.test",
                title: "B",
                index: 1,
                pinned: false,
                highlighted: true,
              },
            ],
          },
          {
            id: 20,
            tabs: [
              {
                id: 3,
                url: "https://c.test",
                title: "C",
                index: 0,
                pinned: false,
                highlighted: false,
              },
            ],
          },
        ],
        currentWindowId: 10,
        highlightedTabIds: [2],
      });
    });

    it("drops tabs without ids and windows without ids", async () => {
      getWindowsAll.mockResolvedValue([
        {
          id: 10,
          tabs: [
            { id: 1, url: "https://a.test", title: "A", index: 0, pinned: false },
            { url: "https://no-id.test", title: "No id", index: 1, pinned: false },
          ],
        },
        { tabs: [{ id: 9, url: "https://x.test", title: "X", index: 0, pinned: false }] },
      ]);
      query.mockResolvedValue([]);

      const snapshot = await getScopeSnapshot();

      expect(snapshot.windows).toEqual([
        {
          id: 10,
          tabs: [
            {
              id: 1,
              url: "https://a.test",
              title: "A",
              index: 0,
              pinned: false,
              highlighted: false,
            },
          ],
        },
      ]);
      expect(snapshot.highlightedTabIds).toEqual([]);
    });

    it("derives currentWindowId from the highlighted query and falls back to the first window", async () => {
      // highlighted query is currentWindow-scoped, so its tabs reveal the current window id
      getWindowsAll.mockResolvedValue([
        { id: 10, tabs: [{ id: 1, url: "https://a.test", title: "A", index: 0, pinned: false }] },
        { id: 20, tabs: [{ id: 2, url: "https://b.test", title: "B", index: 0, pinned: false }] },
      ]);
      query.mockResolvedValue([{ id: 2, windowId: 20 }]);

      const snapshot = await getScopeSnapshot();

      expect(snapshot.currentWindowId).toBe(20);
      expect(snapshot.highlightedTabIds).toEqual([2]);
    });
  });
  ```

- [ ] **Step 2: Run it & expect FAIL.**

  ```
  cd apps/extension && bunx vitest run lib/tabs-service.test.ts
  ```

  Expected failure: `getScopeSnapshot` is not exported — Vitest reports `"getScopeSnapshot" is not exported by "lib/tabs-service.ts"` (import resolution error), so the suite fails to run.

- [ ] **Step 3: Widen `TabLite` and implement `getScopeSnapshot` — minimal implementation.**

  Add the two optional fields to the existing `TabLite` in `apps/extension/lib/types.ts`:

  ```ts
  // apps/extension/lib/types.ts — replace the TabLite interface
  export interface TabLite {
    id: number;
    url: string;
    title: string;
    index: number;
    pinned: boolean;
    favIconUrl?: string;
    highlighted?: boolean;
  }
  ```

  Extend `apps/extension/lib/tabs-service.ts`. Replace the import line + `RawTab` + `toTabLite` block at the top:

  ```ts
  // apps/extension/lib/tabs-service.ts — replace the import + RawTab + toTabLite block
  import type { TabLite } from "./types.ts";
  import type { ScopeSnapshot, WindowLite } from "@/lib/copy/types.ts";

  interface RawTab {
    id?: number;
    url?: string;
    title?: string;
    index?: number;
    pinned?: boolean;
    favIconUrl?: string;
    highlighted?: boolean;
    windowId?: number;
  }

  interface RawWindow {
    id?: number;
    tabs?: RawTab[];
  }

  function toTabLite(tab: RawTab): TabLite | undefined {
    if (typeof tab.id !== "number") {
      return undefined;
    }

    return {
      id: tab.id,
      url: tab.url ?? "",
      title: tab.title ?? tab.url ?? "",
      index: tab.index ?? 0,
      pinned: tab.pinned ?? false,
      // donor maps favIconUrl through (json format reads it); highlighted feeds scope.ts
      ...(tab.favIconUrl === undefined ? {} : { favIconUrl: tab.favIconUrl }),
      highlighted: tab.highlighted ?? false,
    };
  }
  ```

  Append `getScopeSnapshot` at the end of the file:

  ```ts
  // apps/extension/lib/tabs-service.ts — append at end of file
  // Single raw read for the copy engine: all windows + tabs (donor getWindowsAndTabs)
  // plus the highlighted ids of the current window (donor getTabs highlighted branch).
  // No pinned filtering here — selectScope (scope.ts) owns that.
  export async function getScopeSnapshot(): Promise<ScopeSnapshot> {
    const rawWindows = (await browser.windows.getAll({ populate: true })) as RawWindow[];
    const highlightedTabs = (await browser.tabs.query({
      highlighted: true,
      currentWindow: true,
    })) as RawTab[];

    const windows: WindowLite[] = rawWindows.flatMap((win) => {
      if (typeof win.id !== "number") {
        return [];
      }

      const tabs = (win.tabs ?? []).flatMap((tab) => {
        const tabLite = toTabLite(tab);

        return tabLite === undefined ? [] : [tabLite];
      });

      return [{ id: win.id, tabs }];
    });

    const highlightedTabIds = highlightedTabs.flatMap((tab) =>
      typeof tab.id === "number" ? [tab.id] : [],
    );

    const currentWindowId =
      highlightedTabs.find((tab) => typeof tab.windowId === "number")?.windowId ??
      windows[0]?.id ??
      -1;

    return { windows, currentWindowId, highlightedTabIds };
  }
  ```

- [ ] **Step 4: Run it & expect PASS.**

  ```
  cd apps/extension && bunx vitest run lib/tabs-service.test.ts
  ```

  Expected: the three new `getScopeSnapshot` cases pass. The widened `toTabLite` now also emits `highlighted: false`, so the pre-existing `getCurrentWindowTabs` test (lib/tabs-service.test.ts:30-32) fails because its expected object lacks `highlighted`. Update that expectation in the same edit:

  ```ts
  // apps/extension/lib/tabs-service.test.ts — update the getCurrentWindowTabs expectation
  await expect(getCurrentWindowTabs()).resolves.toEqual([
    {
      id: 1,
      url: "https://example.com",
      title: "Example",
      index: 0,
      pinned: true,
      highlighted: false,
    },
  ]);
  ```

  Re-run `cd apps/extension && bunx vitest run lib/tabs-service.test.ts` and expect green.

- [ ] **Step 5: Commit.**

  ```
  git add apps/extension/lib/tabs-service.ts apps/extension/lib/tabs-service.test.ts apps/extension/lib/types.ts && git commit -m "feat(copy): add getScopeSnapshot tabs-service adapter"
  ```

---

### Task L: runCopy + getCopyPopupData orchestration

Module L wires the M1 copy pipeline together inside the existing `apps/extension/lib/orchestration.ts`. It adds two public functions:

- `getCopyPopupData()` — the data the Copy popup needs: the live scope list (each scope id + its current tab count), the visible formats (M1 = the builtin list, id + label), and the default format id.
- `runCopy(scopeId, formatId, sink)` — the pipeline: snapshot → `selectScope` (includePinned defaults to **true**, DEVIATION #2) → `resolveConfiguredFormat` → `render` → `buildPayload` → `sink.consume` → return `{ count }`.

Depends on Modules A (`lib/copy/types.ts`), C (`lib/copy/scope.ts` — `selectScope`, `SCOPES`/`scope catalog`), E (`lib/copy/configured-format.ts` — `resolveConfiguredFormat`), F/D (`lib/copy/format.ts` — `BUILTIN_FORMATS`/`getFormat`), G (`lib/copy/render.ts` — `render`), H (`lib/copy/entries.ts` — `buildPayload`), I (`lib/sinks/sink.ts` — `Sink`), K (`lib/tabs-service.ts` — `getScopeSnapshot`).

All work happens on branch `feat/tab-copy-engine-design`. All `bunx vitest run` / `git` commands assume CWD `apps/extension`.

> Contract assumptions about already-built modules (do NOT redefine — import them):
> - `lib/copy/scope.ts` exports `selectScope(snapshot: ScopeSnapshot, scopeId: ScopeId, includePinned: boolean): ScopeSelection` and a scope catalog `SCOPES: readonly { id: ScopeId }[]`.
> - `lib/copy/configured-format.ts` exports `resolveConfiguredFormat(formatId: FormatId): ConfiguredFormat`.
> - `lib/copy/format.ts` exports `BUILTIN_FORMATS: readonly Format<any>[]` (each with `id` + `label()`), and the `FormatId` type.
> - `lib/copy/render.ts` exports `render(selection, format): Rendered`.
> - `lib/copy/entries.ts` exports `buildPayload(selection, rendered?): CopyPayload`.
> - `lib/tabs-service.ts` exports `getScopeSnapshot(): Promise<ScopeSnapshot>`.
> - `lib/sinks/sink.ts` exports `interface Sink { consume(payload: CopyPayload): Promise<void> }`.

---

- [ ] **Step 1: Write the failing test for `runCopy` (pipeline + count, includePinned=true).**

  Create `lib/copy/orchestration-copy.test.ts` (kept separate from the existing `lib/orchestration.test.ts` so the sort/extract mocks don't collide with the copy-pipeline mocks):

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  import { getCopyPopupData, runCopy } from "@/lib/orchestration.ts";
  import type { CopyPayload, ScopeSnapshot, Sink } from "@/lib/copy/types.ts";

  const mocks = vi.hoisted(() => ({
    getScopeSnapshot: vi.fn(),
    selectScope: vi.fn(),
    resolveConfiguredFormat: vi.fn(),
    render: vi.fn(),
    buildPayload: vi.fn(),
  }));

  vi.mock("@/lib/tabs-service.ts", () => ({
    getScopeSnapshot: mocks.getScopeSnapshot,
  }));

  vi.mock("@/lib/copy/scope.ts", () => ({
    selectScope: mocks.selectScope,
    SCOPES: [
      { id: "highlighted-tabs" },
      { id: "window-tabs" },
      { id: "all-tabs" },
      { id: "all-windows-and-tabs" },
    ],
  }));

  vi.mock("@/lib/copy/configured-format.ts", () => ({
    resolveConfiguredFormat: mocks.resolveConfiguredFormat,
  }));

  vi.mock("@/lib/copy/render.ts", () => ({
    render: mocks.render,
  }));

  vi.mock("@/lib/copy/entries.ts", () => ({
    buildPayload: mocks.buildPayload,
  }));

  vi.mock("@/lib/copy/format.ts", () => ({
    BUILTIN_FORMATS: [
      { id: "link", label: () => "Link" },
      { id: "url", label: () => "URL" },
      { id: "title", label: () => "Title" },
    ],
  }));

  const snapshot: ScopeSnapshot = {
    windows: [
      {
        id: 1,
        tabs: [
          { id: 10, url: "https://a.example/", title: "A", index: 0, pinned: true },
          { id: 11, url: "https://b.example/", title: "B", index: 1, pinned: false },
        ],
      },
    ],
    currentWindowId: 1,
    highlightedTabIds: [11],
  };

  describe("runCopy", () => {
    beforeEach(() => {
      mocks.getScopeSnapshot.mockReset();
      mocks.selectScope.mockReset();
      mocks.resolveConfiguredFormat.mockReset();
      mocks.render.mockReset();
      mocks.buildPayload.mockReset();

      mocks.getScopeSnapshot.mockResolvedValue(snapshot);
      mocks.selectScope.mockReturnValue({
        scope: "tab",
        tabs: snapshot.windows[0]!.tabs,
      });
      mocks.resolveConfiguredFormat.mockReturnValue({
        id: "link",
        label: "Link",
        transforms: { text: { tab: () => "" } },
      });
      mocks.render.mockReturnValue({ text: "rendered-text" });
      mocks.buildPayload.mockImplementation(
        (_selection, rendered): CopyPayload => ({
          scope: "tab",
          entries: [
            { title: "A", url: "https://a.example/", globalSeq: 1 },
            { title: "B", url: "https://b.example/", globalSeq: 2 },
          ],
          rendered,
        }),
      );
    });

    it("drives snapshot -> selectScope -> render -> buildPayload -> sink and returns the entry count", async () => {
      const consumed: CopyPayload[] = [];
      const sink: Sink = {
        consume: vi.fn(async (payload: CopyPayload) => {
          consumed.push(payload);
        }),
      };

      const result = await runCopy("all-tabs", "link", sink);

      // includePinned defaults to true (DEVIATION #2): pinned tabs are NOT filtered out
      expect(mocks.selectScope).toHaveBeenCalledWith(snapshot, "all-tabs", true);
      expect(mocks.resolveConfiguredFormat).toHaveBeenCalledWith("link");
      expect(mocks.render).toHaveBeenCalledWith(
        { scope: "tab", tabs: snapshot.windows[0]!.tabs },
        { id: "link", label: "Link", transforms: { text: { tab: expect.any(Function) } } },
      );
      expect(mocks.buildPayload).toHaveBeenCalledWith(
        { scope: "tab", tabs: snapshot.windows[0]!.tabs },
        { text: "rendered-text" },
      );
      expect(sink.consume).toHaveBeenCalledTimes(1);
      expect(consumed[0]).toMatchObject({ scope: "tab" });
      expect(result).toEqual({ count: 2 });
    });

    it("counts flattened entries for a window-scoped payload", async () => {
      mocks.selectScope.mockReturnValue({ scope: "window", windows: snapshot.windows });
      mocks.buildPayload.mockReturnValue({
        scope: "window",
        windows: [{ windowSeq: 1, entries: [{ title: "A", url: "https://a.example/", globalSeq: 1 }] }],
        entries: [{ title: "A", url: "https://a.example/", globalSeq: 1 }],
        rendered: { text: "rendered-text" },
      });

      const sink: Sink = { consume: vi.fn(async () => {}) };

      const result = await runCopy("all-windows-and-tabs", "link", sink);

      expect(result).toEqual({ count: 1 });
    });
  });
  ```

- [ ] **Step 2: Run the test, expect FAIL.**

  ```
  bunx vitest run lib/copy/orchestration-copy.test.ts
  ```

  Expected failure: `getCopyPopupData`/`runCopy` are not exported from `@/lib/orchestration.ts` — error similar to `SyntaxError: The requested module './orchestration.ts' does not provide an export named 'runCopy'` (or a TS "has no exported member 'runCopy'" diagnostic). Both tests fail.

- [ ] **Step 3: Write the minimal `runCopy` implementation.**

  Append to `apps/extension/lib/orchestration.ts` (keep the existing sort/extract code untouched; add the imports at the top alongside the existing imports):

  ```ts
  import { resolveConfiguredFormat } from "./copy/configured-format.ts";
  import { buildPayload } from "./copy/entries.ts";
  import { render } from "./copy/render.ts";
  import { selectScope } from "./copy/scope.ts";
  import type { CopyPayload, FormatId, ScopeId, Sink } from "./copy/types.ts";
  import { getScopeSnapshot } from "./tabs-service.ts";

  // Copy is its own includePinned default of `true` (mirrors the donor, which
  // includes pinned tabs unless ignorePinnedTabs is set). tab-sorter's
  // DEFAULT_PREFS.ignorePinned would otherwise silently break byte-parity, so
  // the copy pipeline does NOT consult those prefs (design deviation #2).
  const COPY_INCLUDE_PINNED = true;

  function countEntries(payload: CopyPayload): number {
    return payload.entries.length;
  }

  export async function runCopy(
    scopeId: ScopeId,
    formatId: FormatId,
    sink: Sink,
  ): Promise<{ count: number }> {
    const snapshot = await getScopeSnapshot();
    const selection = selectScope(snapshot, scopeId, COPY_INCLUDE_PINNED);
    const format = resolveConfiguredFormat(formatId);
    const rendered = render(selection, format);
    const payload = buildPayload(selection, rendered);

    await sink.consume(payload);

    return { count: countEntries(payload) };
  }
  ```

  > Note: both `CopyPayload` arms carry a flat `entries: TabRecord[]` (the window arm flattens for record sinks per the canonical contract), so `payload.entries.length` is the correct count for either scope.

- [ ] **Step 4: Run the `runCopy` test, expect PASS.**

  ```
  bunx vitest run lib/copy/orchestration-copy.test.ts
  ```

  Expected: the `runCopy` describe block passes; the `getCopyPopupData` import is present (used by the test file header) but `getCopyPopupData` is still undefined, so the file as a whole still fails on the next test — that is covered in Step 5/6. (If you split test files instead, this would be all-green; here it stays red until Step 7. Proceed to Step 5.)

- [ ] **Step 5: Write the failing test for `getCopyPopupData`.**

  Add this describe block to `lib/copy/orchestration-copy.test.ts`, after the `runCopy` describe:

  ```ts
  describe("getCopyPopupData", () => {
    beforeEach(() => {
      mocks.getScopeSnapshot.mockReset();
      mocks.selectScope.mockReset();
      mocks.getScopeSnapshot.mockResolvedValue(snapshot);
      // selectScope is called once per scope to compute a live count.
      mocks.selectScope.mockImplementation((_snapshot, scopeId: string) => {
        if (scopeId === "highlighted-tabs") return { scope: "tab", tabs: [snapshot.windows[0]!.tabs[1]!] };
        if (scopeId === "window-tabs") return { scope: "tab", tabs: snapshot.windows[0]!.tabs };
        if (scopeId === "all-tabs") return { scope: "tab", tabs: snapshot.windows[0]!.tabs };
        return { scope: "window", windows: snapshot.windows };
      });
    });

    it("returns scopes with live counts, visible builtin formats, and the default format id", async () => {
      const data = await getCopyPopupData();

      expect(data.scopes).toEqual([
        { id: "highlighted-tabs", count: 1 },
        { id: "window-tabs", count: 2 },
        { id: "all-tabs", count: 2 },
        { id: "all-windows-and-tabs", count: 2 },
      ]);
      expect(data.formats).toEqual([
        { id: "link", label: "Link" },
        { id: "url", label: "URL" },
        { id: "title", label: "Title" },
      ]);
      // M1: default is the first visible (builtin) format, mirroring the donor's
      // getDefaultFormatId() = first visible format ('link').
      expect(data.defaultFormatId).toBe("link");
    });
  });
  ```

- [ ] **Step 6: Run the test, expect FAIL.**

  ```
  bunx vitest run lib/copy/orchestration-copy.test.ts
  ```

  Expected failure: `getCopyPopupData` is not exported — `TypeError: getCopyPopupData is not a function` (or the TS "has no exported member" diagnostic), and the new describe block fails.

- [ ] **Step 7: Write the minimal `getCopyPopupData` implementation.**

  Append to `apps/extension/lib/orchestration.ts`. Add `BUILTIN_FORMATS` to the format import:

  ```ts
  import { BUILTIN_FORMATS } from "./copy/format.ts";
  import { SCOPES } from "./copy/scope.ts";
  ```

  Then add:

  ```ts
  export interface CopyScopeData {
    id: ScopeId;
    count: number;
  }

  export interface CopyFormatData {
    id: FormatId;
    label: string;
  }

  export interface CopyPopupData {
    scopes: CopyScopeData[];
    formats: CopyFormatData[];
    defaultFormatId: FormatId;
  }

  function countSelection(selection: ReturnType<typeof selectScope>): number {
    return selection.scope === "tab"
      ? selection.tabs.length
      : selection.windows.reduce((total, window) => total + window.tabs.length, 0);
  }

  export async function getCopyPopupData(): Promise<CopyPopupData> {
    const snapshot = await getScopeSnapshot();

    const scopes: CopyScopeData[] = SCOPES.map((scope) => ({
      id: scope.id,
      count: countSelection(selectScope(snapshot, scope.id, COPY_INCLUDE_PINNED)),
    }));

    // M1 visible formats = the builtin list, in registry order. Prefs-driven
    // visibility/order/custom formats arrive in M3.
    const formats: CopyFormatData[] = BUILTIN_FORMATS.map((format) => ({
      id: format.id,
      label: format.label(),
    }));

    // Donor parity: the default format is the first visible format.
    const defaultFormatId = formats[0]!.id;

    return { scopes, formats, defaultFormatId };
  }
  ```

- [ ] **Step 8: Run the test, expect PASS.**

  ```
  bunx vitest run lib/copy/orchestration-copy.test.ts
  ```

  Expected: all tests in `lib/copy/orchestration-copy.test.ts` pass. Then run the full suite to confirm no regression in the existing sort/extract orchestration tests:

  ```
  bun run test
  ```

  Expected: green.

- [ ] **Step 9: Commit.**

  ```
  git add apps/extension/lib/orchestration.ts apps/extension/lib/copy/orchestration-copy.test.ts && git commit -m "feat(copy): add runCopy + getCopyPopupData orchestration (Module L)"
  ```

---

> Dependency note for the executing agent: `BUILTIN_FORMATS`, `SCOPES`, `resolveConfiguredFormat`, `render`, `buildPayload`, `getScopeSnapshot`, and `Sink` must already exist (Modules A,C,E,F,G,H,I,K). If the real `SCOPES` export is named differently (e.g. `scopes` / `COPY_SCOPES`) or carries richer objects, adjust the import and `scope.id` access to match the actual Module C export — the count logic via `selectScope` is unchanged. The ClipboardSink wiring for the popup lives in the popup entrypoint task (Module J/popup), which constructs `new ClipboardSink()` and passes it to `runCopy`; Module L stays sink-agnostic and is tested with a spy sink.

---

See structured task_markdown field above.

## Self-review

**Coverage.** The block set A..M covers the full M1 milestone (spec §7): pure core (`scope`/`format`/`template`/`configured-format`/`render`/`entries` = C,D,F,E,G,H on the A/B type+helper base), the clipboard path (`clipboard-item` + `navigator-clipboard` = J), `sinks/` (clipboard + file-download, refactor of `export.ts` = I), the tabs-service snapshot feeding `selectScope` (K), orchestration `runCopy`/popup data (L), and the Soft Editorial Copy popup (M). §4.1 seam, §4.2 `CopyPayload`, §4.3 popup clipboard mechanism, §4.4 sound type design, §5 format/template/scope notes, §6 M1 popup UI, and deviations #2/#3/#4/#5/#7 all map to a block.

**Consistency fixes to apply before generating task-blocks:**
1. **Collapse the duplicate popup-data contract (L vs M).** Pick one shape and have M consume L's export — do not declare `getCopyPopupData`/`CopyPopupData` twice. Use the richer view shape (`label` + `description?` + `isDefault`) so the UI needs no second lookup. See consistency_issues.
2. **`runCopy` arity.** Lock M1 to the 3-param `runCopy(scopeId, formatId, sink)` from CONTRACTS; the §4.5 `trigger` param is M2 (background surfaces) and must not leak into the M1 signature.
3. **`writeToClipboard` ownership.** J owns the real `lib/clipboard/navigator-clipboard.ts` export; I's "stub if not present" note must be dropped from the plan since J lands in the same milestone (M1) — `ClipboardSink` depends on J, so order I after J or have I import J's export directly.
4. **`getFormat` return type.** Standardize on `getFormat(id: FormatId): Format<any>` (CONTRACTS) across D's exports and every consumer (E's `getFormatById`), not the bare `Format` in the symbol table.

**Out of scope (explicitly deferred, do not plan here):** M2 — context menus (`menu-id`, `menu-structure`, `commands`, `getDummyTab`), keyboard commands, `action.onClicked`, the offscreen path (`offscreen.ts` + `offscreen-client.ts`), manifest permission deltas (`offscreen`/`clipboardWrite`/`minimum_chrome_version`), icon-flash feedback. M3 — `prefs`, `options-spec`, `ids`, storage persistence, the options page (format manager + custom-format template editor). These appear in the symbol table only as future surfaces and have no M1 task-block.