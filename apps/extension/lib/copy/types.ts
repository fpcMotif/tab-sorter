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
