import type { Prefs, RegexPreset, SortMode } from "./types";

const PREFS_KEY = "prefs";

export const defaultPrefs: Prefs = {
  defaultSort: "title",
  ignorePinned: true,
  regexPresets: [],
};

type StorageArea = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type BrowserLike = {
  storage?: {
    sync?: StorageArea;
  };
};

function getStorage(): StorageArea {
  const browserLike = (globalThis as typeof globalThis & { browser?: BrowserLike }).browser;
  const storage = browserLike?.storage?.sync;

  if (!storage) {
    throw new Error("Extension storage API is unavailable");
  }

  return storage;
}

function isSortMode(value: unknown): value is SortMode {
  return value === "title" || value === "domain";
}

function normalizePreset(value: unknown): RegexPreset | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const preset = value as Partial<RegexPreset>;

  if (typeof preset.label !== "string" || typeof preset.source !== "string") {
    return null;
  }

  return {
    label: preset.label,
    source: preset.source,
    flags: typeof preset.flags === "string" ? preset.flags : "",
  };
}

export function normalizePrefs(value: unknown): Prefs {
  if (!value || typeof value !== "object") {
    return { ...defaultPrefs };
  }

  const prefs = value as Partial<Prefs>;

  return {
    defaultSort: isSortMode(prefs.defaultSort) ? prefs.defaultSort : defaultPrefs.defaultSort,
    ignorePinned: typeof prefs.ignorePinned === "boolean" ? prefs.ignorePinned : defaultPrefs.ignorePinned,
    regexPresets: Array.isArray(prefs.regexPresets)
      ? prefs.regexPresets.map(normalizePreset).filter((preset): preset is RegexPreset => preset !== null)
      : defaultPrefs.regexPresets,
  };
}

export async function getPrefs(): Promise<Prefs> {
  const data = await getStorage().get(PREFS_KEY);
  return normalizePrefs(data[PREFS_KEY]);
}

export async function setPrefs(nextPrefs: Prefs): Promise<void> {
  await getStorage().set({ [PREFS_KEY]: normalizePrefs(nextPrefs) });
}
