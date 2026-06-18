import type { Prefs, SortMode } from "./types.ts";

export const DEFAULT_PREFS: Prefs = {
  defaultSort: "title" as SortMode,
  ignorePinned: true,
  regexPresets: [],
};

const STORAGE_KEY = "prefs";

export async function getPrefs(): Promise<Prefs> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PREFS };
  }

  const partial = raw as Partial<Prefs>;

  return {
    defaultSort: partial.defaultSort ?? DEFAULT_PREFS.defaultSort,
    ignorePinned: partial.ignorePinned ?? DEFAULT_PREFS.ignorePinned,
    regexPresets: Array.isArray(partial.regexPresets)
      ? partial.regexPresets
      : DEFAULT_PREFS.regexPresets,
  };
}

export async function setPrefs(prefs: Prefs): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: prefs });
}

export async function resetPrefs(): Promise<Prefs> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_PREFS });
  return { ...DEFAULT_PREFS };
}
