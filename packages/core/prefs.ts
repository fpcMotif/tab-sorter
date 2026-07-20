import { DEFAULT_PREFS } from "./types";
import type { GroupOrder, Prefs, RegexPreset, SortMode } from "./types";

const SORT_MODES = new Set<SortMode>(["title", "domain"]);
const GROUP_ORDERS = new Set<GroupOrder>(["alpha", "sizeDesc"]);

// Bounds a stored minGroupSize so a corrupt value can't make every domain a
// group (a floor of 1 would form a "group" of one — the exact noise
// DEFAULT_PREFS.minGroupSize's own doc comment says this pref exists to
// prevent; DESIGN-SPEC's stepper floor is 2) or make grouping unreachable
// (huge).
export const MIN_GROUP_SIZE_FLOOR = 2;
export const MIN_GROUP_SIZE_CEIL = 99;

export function isSortMode(value: unknown): value is SortMode {
  return SORT_MODES.has(value as SortMode);
}

export function isGroupOrder(value: unknown): value is GroupOrder {
  return GROUP_ORDERS.has(value as GroupOrder);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return parseBoolean(value) ?? fallback;
}

export function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeMinGroupSize(value: unknown): number {
  return isMinGroupSize(value) ? value : DEFAULT_PREFS.minGroupSize;
}

export function isMinGroupSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_GROUP_SIZE_FLOOR &&
    value <= MIN_GROUP_SIZE_CEIL
  );
}

export function normalizePreset(value: unknown): RegexPreset | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const { label, source, flags } = value as Record<string, unknown>;

  if (typeof label !== "string" || typeof source !== "string" || typeof flags !== "string") {
    return undefined;
  }

  return { label, source, flags };
}

// `chrome.storage.sync` is shared across extension versions and devices, so the
// stored shape is untrusted: validate every field and fall back to the default
// rather than handing a malformed `Prefs` (a bad sort mode, a non-array preset
// list) to the popup, which would sort wrong or crash on `.map`.
export function normalizePrefs(stored: unknown): Prefs {
  const prefs = (typeof stored === "object" && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >;

  return {
    defaultSort: isSortMode(prefs.defaultSort) ? prefs.defaultSort : DEFAULT_PREFS.defaultSort,
    ignorePinned: normalizeBoolean(prefs.ignorePinned, DEFAULT_PREFS.ignorePinned),
    regexPresets: Array.isArray(prefs.regexPresets)
      ? prefs.regexPresets.flatMap((preset) => {
          const normalized = normalizePreset(preset);

          return normalized === undefined ? [] : [normalized];
        })
      : DEFAULT_PREFS.regexPresets,
    collapseAfterTidy: normalizeBoolean(prefs.collapseAfterTidy, DEFAULT_PREFS.collapseAfterTidy),
    minGroupSize: normalizeMinGroupSize(prefs.minGroupSize),
    groupOrder: isGroupOrder(prefs.groupOrder) ? prefs.groupOrder : DEFAULT_PREFS.groupOrder,
    regroupExisting: normalizeBoolean(prefs.regroupExisting, DEFAULT_PREFS.regroupExisting),
    dedupeIgnoreHash: normalizeBoolean(prefs.dedupeIgnoreHash, DEFAULT_PREFS.dedupeIgnoreHash),
    dedupeIgnoreQuery: normalizeBoolean(prefs.dedupeIgnoreQuery, DEFAULT_PREFS.dedupeIgnoreQuery),
  };
}
