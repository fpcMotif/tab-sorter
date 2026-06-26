import type { ConfiguredFormat } from "./configured-format.ts";
import type {
  Hooks,
  Rendered,
  ScopeSelection,
  TabLite,
  WindowLite,
} from "./types.ts";

// One enumerated tab in selection order. `globalSeq` is always a single 1-based
// counter across the whole selection; `windowSeq`/`windowTabSeq` are 1-based per
// window and only present for window scope (tab scope leaves them undefined).
export interface EnumeratedTab {
  tab: TabLite;
  globalSeq: number;
  windowSeq?: number;
  windowTabSeq?: number;
}

/**
 * Shared per-tab numbering for the copy engine (reconciliation #6).
 *
 * The render walk (Module G) and the entries builder (Module H) MUST agree on
 * `globalSeq`/`windowSeq`/`windowTabSeq` so the rendered text and the structured
 * `TabRecord[]` never drift. Both import this single generator instead of
 * re-deriving the counters.
 *
 * Ordering and counter semantics mirror the donor
 * `applyTextTransformToWindows`/`applyTextTransformToTabs`
 * (tab-copy-master/src/copy.ts): tab scope yields `{ tab, globalSeq: i + 1 }`;
 * window scope runs `globalSeq` continuously across ALL windows while resetting
 * `windowTabSeq` to 1 in each window and assigning `windowSeq = wi + 1`.
 */
export function* enumerateSelection(
  selection: ScopeSelection,
): Generator<EnumeratedTab> {
  let globalSeq = 1;

  if (selection.scope === "tab") {
    for (const tab of selection.tabs) {
      yield { tab, globalSeq: globalSeq++ };
    }
    return;
  }

  for (let wi = 0; wi < selection.windows.length; wi++) {
    const window = selection.windows[wi]!;
    const windowSeq = wi + 1;
    for (let ti = 0; ti < window.tabs.length; ti++) {
      yield {
        tab: window.tabs[ti]!,
        globalSeq: globalSeq++,
        windowSeq,
        windowTabSeq: ti + 1,
      };
    }
  }
}

// render() assembles a ConfiguredFormat's Hooks into a Rendered { text, html? }.
// Ported from tab-copy-master/src/copy.ts:93-222. text always renders; html only
// when transforms.html is present. Empty selections still fire start/end (no
// short-circuit) — matching the donor assembly.
export function render(
  selection: ScopeSelection,
  format: ConfiguredFormat,
): Rendered {
  const { label, transforms } = format;

  const result: Rendered = {
    text: applyChannel(selection, transforms.text, label),
  };

  if (transforms.html) {
    result.html = applyChannel(selection, transforms.html, label);
  }

  return result;
}

function applyChannel(
  selection: ScopeSelection,
  hooks: Hooks,
  formatName: string,
): string {
  return selection.scope === "tab"
    ? applyTabScope(selection.tabs, hooks, formatName)
    : applyWindowScope(selection.windows, hooks, formatName);
}

function applyTabScope(
  tabs: TabLite[],
  hooks: Hooks,
  formatName: string,
): string {
  const start =
    hooks.start?.({ formatName, tabCount: tabs.length, scope: "tab" }) ?? "";

  const body = tabs
    .map((tab, i) => hooks.tab({ tab, globalSeq: i + 1 }))
    .join(hooks.tabDelimiter ?? "");

  const end =
    hooks.end?.({ formatName, tabCount: tabs.length, scope: "tab" }) ?? "";

  return `${start}${body}${end}`;
}

function applyWindowScope(
  windows: WindowLite[],
  hooks: Hooks,
  formatName: string,
): string {
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

  const end =
    hooks.end?.({ formatName, tabCount, windowCount, scope: "window" }) ?? "";

  return `${start}${body}${end}`;
}
