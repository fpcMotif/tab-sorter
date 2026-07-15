import { reasonToString, validatePattern } from "./match";
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
export const MIN_GROUP_SIZE_FLOOR = 2;
export const MIN_GROUP_SIZE_CEIL = 99;
export const MIN_GROUP_SIZE_ERROR = `Enter a whole number from ${MIN_GROUP_SIZE_FLOOR} to ${MIN_GROUP_SIZE_CEIL}.`;

// Bounds keep the whole prefs object well under chrome.storage.sync's
// ~8KB-per-item quota, beyond which every save (not just presets) would fail.
export const MAX_PRESETS = 50;
// Deliberately stricter than match.ts' MATCH_SAFETY_CAP (1000) — a storage
// quota bound, not a ReDoS bound. See docs/adr/0001-two-pattern-caps.md.
export const MAX_PRESET_SOURCE_LENGTH = 500;
export const MAX_PRESET_LABEL_LENGTH = 60;

// Same semantics as the stepper's own clamp: reject anything that isn't a
// bare non-negative integer in range, rather than coercing ("  3 " -> 3)
// and silently accepting input the stepper itself would never produce.
export function parseMinGroupSize(raw: string): number | undefined {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const value = Number(trimmed);

  return value >= MIN_GROUP_SIZE_FLOOR && value <= MIN_GROUP_SIZE_CEIL ? value : undefined;
}

// The one home for judging a preset draft, so the options form and any future
// producer read the same rule. Checks the storage cap (500) before deferring
// to validatePattern's safety cap (1000) — the storage cap always fires first
// (ADR-0001's intentional ordering).
export function validatePreset(draft: RegexPreset, existingCount: number): string {
  if (draft.label.trim().length === 0) {
    return "Preset label is required.";
  }

  if (draft.label.length > MAX_PRESET_LABEL_LENGTH) {
    return `Label is too long (max ${MAX_PRESET_LABEL_LENGTH} characters).`;
  }

  if (draft.source.trim().length === 0) {
    return "Pattern is required.";
  }

  if (draft.source.length > MAX_PRESET_SOURCE_LENGTH) {
    return `Pattern is too long (max ${MAX_PRESET_SOURCE_LENGTH} characters).`;
  }

  if (existingCount >= MAX_PRESETS) {
    return `Preset limit reached (${MAX_PRESETS}). Delete one to add another.`;
  }

  const verdict = validatePattern(draft.source, draft.flags);

  if (!verdict.ok) {
    return reasonToString(verdict.reason);
  }

  return "";
}

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
