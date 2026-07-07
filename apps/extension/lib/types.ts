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

export const DEFAULT_PREFS: Prefs = {
  defaultSort: "title",
  ignorePinned: true,
  regexPresets: [],
};

export interface DomainGroup {
  domain: string;
  count: number;
  tabIds: number[];
}
