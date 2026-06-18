export interface TabLite {
  id: number;
  url: string;
  title: string;
  index: number;
  pinned: boolean;
}

export type SortMode = "title" | "domain";

export interface RegexPreset {
  label: string;
  source: string;
  flags: string;
}

export interface Prefs {
  defaultSort: SortMode;
  ignorePinned: boolean;
  regexPresets: RegexPreset[];
}

export interface DomainGroup {
  domain: string;
  count: number;
  tabIds: number[];
}

export type ExtractMatcher =
  | { type: "domain"; domain: string }
  | { type: "regex"; source: string; flags?: string };

export interface ActionResult {
  moved: number;
}
