import {
  DEFAULT_PREFS,
  type GroupOrder,
  type Prefs,
  type RegexPreset,
  type SortMode,
} from "./types";

const PREFS_KEY = "prefs";
const SORT_MODES = new Set<SortMode>(["title", "domain"]);
const GROUP_ORDERS = new Set<GroupOrder>(["alpha", "sizeDesc"]);

// Bounds a stored minGroupSize so a corrupt value can't make every domain a
// group (a floor of 1 would form a "group" of one — the exact noise
// DEFAULT_PREFS.minGroupSize's own doc comment says this pref exists to
// prevent; DESIGN-SPEC's stepper floor is 2) or make grouping unreachable
// (huge).
const MIN_GROUP_SIZE_FLOOR = 2;
const MIN_GROUP_SIZE_CEIL = 99;

function isSortMode(value: unknown): value is SortMode {
  return SORT_MODES.has(value as SortMode);
}

function isGroupOrder(value: unknown): value is GroupOrder {
  return GROUP_ORDERS.has(value as GroupOrder);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMinGroupSize(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_GROUP_SIZE_FLOOR &&
    value <= MIN_GROUP_SIZE_CEIL
    ? value
    : DEFAULT_PREFS.minGroupSize;
}

function normalizePreset(value: unknown): RegexPreset | undefined {
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
    ignorePinned:
      typeof prefs.ignorePinned === "boolean" ? prefs.ignorePinned : DEFAULT_PREFS.ignorePinned,
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

export async function getPrefs(): Promise<Prefs> {
  const stored = (await browser.storage.sync.get(PREFS_KEY)) as { prefs?: unknown };

  return normalizePrefs(stored.prefs);
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const prefs = {
    ...(await getPrefs()),
    ...patch,
  };

  await browser.storage.sync.set({ [PREFS_KEY]: prefs });

  return prefs;
}

// Owns the area/key filtering and normalization callers would otherwise
// duplicate: only chrome.storage.sync writes to PREFS_KEY are prefs changes,
// and the raw newValue is untrusted the same way getPrefs' stored value is.
export function onPrefsChanged(cb: (prefs: Prefs) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== "sync" || !(PREFS_KEY in changes)) {
      return;
    }

    cb(normalizePrefs(changes[PREFS_KEY].newValue));
  };

  browser.storage.onChanged.addListener(listener);

  return () => browser.storage.onChanged.removeListener(listener);
}
