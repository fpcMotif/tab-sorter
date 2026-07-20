import {
  isGroupOrder,
  isMinGroupSize,
  isSortMode,
  normalizePreset,
  normalizePrefs,
  parseBoolean,
} from "@tab-sorter/core/prefs";
import { protocolError } from "@tab-sorter/core/protocol-error";
import type { Prefs, RegexPreset } from "@tab-sorter/core/types";

const PREFS_KEY = "prefs";

function parsePresetList(value: unknown): RegexPreset[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const presets = value.map(normalizePreset);

  return presets.some((preset) => preset === undefined) ? undefined : (presets as RegexPreset[]);
}

type PrefPatchParsers = {
  [Key in keyof Prefs]: (value: unknown) => Prefs[Key] | undefined;
};

// This map is exhaustive over Prefs. It owns both accepted patch keys and
// strict patch validation. normalizePrefs stays separate because stored data
// is salvaged field by field, while a command patch is rejected as one unit.
const PREF_PATCH_PARSERS: PrefPatchParsers = {
  defaultSort: (value) => (isSortMode(value) ? value : undefined),
  ignorePinned: parseBoolean,
  regexPresets: parsePresetList,
  collapseAfterTidy: parseBoolean,
  minGroupSize: (value) => (isMinGroupSize(value) ? value : undefined),
  groupOrder: (value) => (isGroupOrder(value) ? value : undefined),
  regroupExisting: parseBoolean,
  dedupeIgnoreHash: parseBoolean,
  dedupeIgnoreQuery: parseBoolean,
};
const PREF_KEYS = new Set<keyof Prefs>(Object.keys(PREF_PATCH_PARSERS) as Array<keyof Prefs>);

function isPrefKey(value: string): value is keyof Prefs {
  return PREF_KEYS.has(value as keyof Prefs);
}

export async function getPrefs(): Promise<Prefs> {
  const stored = (await browser.storage.sync.get(PREFS_KEY)) as { prefs?: unknown };

  return normalizePrefs(stored.prefs);
}

function parsePrefsPatch(value: unknown): Partial<Prefs> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const entries: Array<[keyof Prefs, Prefs[keyof Prefs]]> = [];

  for (const [key, fieldValue] of Object.entries(raw)) {
    if (!isPrefKey(key)) {
      return undefined;
    }

    const parsed = PREF_PATCH_PARSERS[key](fieldValue);
    if (parsed === undefined) {
      return undefined;
    }

    entries.push([key, parsed]);
  }

  return Object.fromEntries(entries) as Partial<Prefs>;
}

let prefsWriteTail: Promise<void> = Promise.resolve();

export function commitPrefsPatch(value: unknown): Promise<Prefs> {
  const patch = parsePrefsPatch(value);

  if (patch === undefined) {
    return Promise.reject(protocolError("INVALID_REQUEST", "invalid prefs patch"));
  }

  const write = prefsWriteTail.then(async () => {
    const prefs = {
      ...(await getPrefs()),
      ...patch,
    };

    await browser.storage.sync.set({ [PREFS_KEY]: prefs });

    return prefs;
  });

  prefsWriteTail = write.then(
    () => undefined,
    () => undefined,
  );

  return write;
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
