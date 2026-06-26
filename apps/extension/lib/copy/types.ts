export type ScopeId =
  | "highlighted-tabs"
  | "window-tabs"
  | "all-tabs"
  | "all-windows-and-tabs";

export const SCOPE_IDS = [
  "highlighted-tabs",
  "window-tabs",
  "all-tabs",
  "all-windows-and-tabs",
] as const satisfies readonly ScopeId[];

// Every scope except the single window scope is a tab scope.
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

// The two RENDER shapes, intentionally distinct from ScopeId: the three
// tab-scopes (highlighted-tabs, window-tabs, all-tabs) collapse to `tab`,
// and all-windows-and-tabs maps to `window`.
export type ScopeSelection =
  | { scope: "tab"; tabs: TabLite[] }
  | { scope: "window"; windows: WindowLite[] };

// engine-computed: globalSeq always present; windowSeq/windowTabSeq set when grouped
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

export interface Rendered {
  text: string;
  html?: string;
}

export type CopyPayload =
  | { scope: "tab"; entries: TabRecord[]; rendered?: Rendered }
  | {
      scope: "window";
      windows: { windowSeq: number; entries: TabRecord[] }[];
      entries: TabRecord[];
      rendered?: Rendered;
    };

// --- Render hook contexts + transforms (consumed by Module D format registry
// and Module G render walk). Donor shapes from tab-copy-master/src/format.ts
// TextTransform, but with our TabLite/WindowLite instead of chrome.tabs.Tab.

// Context passed to a format's `tab` hook for each rendered tab.
export interface TabCtx {
  tab: TabLite;
  globalSeq: number; // sequence across all tabs
  windowTabSeq?: number; // sequence within window; missing for tab-only scopes
  windowSeq?: number; // sequence of the parent window; missing for tab-only scopes
  windowCount?: number; // missing for tab-only scopes
}

// Context passed to a format's `start`/`end` hooks.
export interface StartCtx {
  formatName: string;
  tabCount: number;
  windowCount?: number; // missing for tab-only scopes
  scope: "tab" | "window";
}

// Context passed to a format's `windowStart`/`windowEnd` hooks.
export interface WindowCtx {
  window: WindowLite;
  seq: number;
  windowCount: number;
  windowTabCount: number;
}

// A single channel (text or html) of a format's transforms. `tab` is the only
// required hook; everything else is optional structure/delimiters.
export interface Hooks {
  start?(c: StartCtx): string;
  windowStart?(c: WindowCtx): string;
  tab(c: TabCtx): string;
  tabDelimiter?: string;
  windowEnd?(c: WindowCtx): string;
  windowDelimiter?: string;
  end?(c: StartCtx): string;
}

// A format produces a text channel and, optionally, an html channel.
export interface Transforms {
  text: Hooks;
  html?: Hooks;
}
