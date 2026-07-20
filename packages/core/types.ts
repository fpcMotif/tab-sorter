// chrome.tabGroups.TAB_GROUP_ID_NONE — the groupId Chrome reports for an ungrouped tab.
export const TAB_GROUP_NONE = -1;

export interface TabLite {
  id: number;
  url: string;
  title: string;
  index: number;
  pinned: boolean;
  // Live tab-group id, TAB_GROUP_NONE when ungrouped. Optional so the pure
  // layer's plain-array fixtures stay terse; absent means ungrouped.
  groupId?: number;
}

export type SortMode = "title" | "domain";

// The 9 values chrome.tabGroups accepts for a group color.
export type GroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export const GROUP_COLORS: readonly GroupColor[] = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

export interface GroupSpec {
  // Stable plan-local identity (the domain for tidy, `g${groupId}` for undo).
  key: string;
  title: string;
  color: GroupColor;
  collapsed: boolean;
  // Desired order WITHIN the group; appears contiguously in TabPlan.order.
  // Never contains a pinned id — tabs.group() silently UNPINS pinned tabs.
  tabIds: number[];
}

// The widened seam (CONTEXT.md "TabPlan"). Invariants the pure layer guarantees:
// - `order` is a permutation of the live unclosed tab ids, pinned-first
//   (never-interleave construction, generalized). Empty `order` means
//   "leave positions alone" (the dedupe case).
// - Each GroupSpec.tabIds is a contiguous slice of `order` with no pinned ids.
// - `ungroup` lists ids that must END ungrouped; membership moves between
//   groups are implied by `groups` (a tab joins at most one group).
export interface TabPlan {
  order: number[];
  groups: GroupSpec[];
  ungroup: number[];
  close: number[];
}

export interface SnapshotTab {
  id: number;
  url: string;
  index: number;
  pinned: boolean;
  groupId: number;
}

export interface SnapshotGroup {
  groupId: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

// Captured by the mutation transaction. MutationHistory stores it inside a
// RestorePoint in browser.storage.session.
export interface WindowSnapshot {
  windowId: number;
  tabs: SnapshotTab[];
  groups: SnapshotGroup[];
  savedAt: number;
}

export type GroupOrder = "alpha" | "sizeDesc";

export interface RegexPreset {
  label: string;
  source: string;
  flags: string;
}

export interface Prefs {
  defaultSort: SortMode;
  ignorePinned: boolean;
  regexPresets: RegexPreset[];
  // Tidy (Layer 1): see docs/prd/2026-06-21-layer1-tidy-groups-undo.md §6.
  collapseAfterTidy: boolean;
  // Domains with fewer tabs than this stay ungrouped (a group of one is noise).
  minGroupSize: number;
  groupOrder: GroupOrder;
  // When false (default), tidy only claims UNGROUPED unpinned tabs and never
  // reshuffles a group the human hand-built.
  regroupExisting: boolean;
  dedupeIgnoreHash: boolean;
  dedupeIgnoreQuery: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  defaultSort: "title",
  ignorePinned: true,
  regexPresets: [],
  collapseAfterTidy: false,
  minGroupSize: 2,
  groupOrder: "alpha",
  regroupExisting: false,
  dedupeIgnoreHash: true,
  dedupeIgnoreQuery: false,
};

export interface DomainGroup {
  domain: string;
  count: number;
  tabIds: number[];
}

// A file-oriented export of the current selection, grouped by domain — see
// buildUrlExport in lib/export.ts and the popup's Download action.
export type ExportFormat = "markdown" | "text";

export interface ExportEntry {
  title: string;
  url: string;
  domain: string;
}

// Clipboard renderings of the current selection (the highlighted tabs). Distinct
// from ExportFormat: copy output is a flat, paste-ready list, not a grouped,
// file-oriented document. See buildClipboardContent in lib/export.ts.
export type ClipboardFormat = "markdown" | "json" | "url" | "html";
