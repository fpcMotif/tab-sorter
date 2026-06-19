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

// Preserved from master's tab-export feature. The logic lives in lib/export.ts
// but is not yet wired into PR #1's popup UI — see the integration TODOs.
export type ExportFormat = "markdown" | "text";

export interface ExportEntry {
  title: string;
  url: string;
  domain: string;
}
