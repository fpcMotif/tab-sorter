export type SortMode = "title" | "domain";

export interface TabLite {
  id: number;
  url: string;
  title: string;
  index: number;
  pinned: boolean;
}

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

export type ExportFormat = "markdown" | "text";

export interface DomainGroup {
  domain: string;
  count: number;
  tabIds: number[];
}

export interface ExportEntry {
  title: string;
  url: string;
  domain: string;
}

export class InvalidPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPatternError";
  }
}
