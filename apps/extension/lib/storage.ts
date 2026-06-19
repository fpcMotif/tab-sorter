import { DEFAULT_PREFS, type Prefs } from "./types";

const PREFS_KEY = "prefs";

type StoredPrefs = {
  prefs?: Partial<Prefs>;
};

function normalizePrefs(storedPrefs: Partial<Prefs> | undefined): Prefs {
  return {
    defaultSort: storedPrefs?.defaultSort ?? DEFAULT_PREFS.defaultSort,
    ignorePinned: storedPrefs?.ignorePinned ?? DEFAULT_PREFS.ignorePinned,
    regexPresets: storedPrefs?.regexPresets ?? DEFAULT_PREFS.regexPresets,
  };
}

export async function getPrefs(): Promise<Prefs> {
  const stored = (await browser.storage.sync.get(PREFS_KEY)) as StoredPrefs;

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
