import { beforeEach, describe, expect, it } from "vitest";

import { fakeBrowser } from "@webext-core/fake-browser";

import { DEFAULT_PREFS, getPrefs, resetPrefs, setPrefs } from "../storage.ts";

describe("storage", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("returns default prefs when storage is empty", async () => {
    const prefs = await getPrefs();
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("returns default prefs when stored value is not an object", async () => {
    await fakeBrowser.storage.sync.set({ prefs: "nope" });
    const prefs = await getPrefs();
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("merges stored partial prefs with defaults", async () => {
    await fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "domain", ignorePinned: false },
    });
    const prefs = await getPrefs();
    expect(prefs.defaultSort).toBe("domain");
    expect(prefs.ignorePinned).toBe(false);
    expect(prefs.regexPresets).toEqual([]);
  });

  it("writes prefs to storage", async () => {
    const next = {
      ...DEFAULT_PREFS,
      regexPresets: [{ label: "GitHub", source: "github", flags: "i" }],
    };
    await setPrefs(next);
    const stored = await fakeBrowser.storage.sync.get("prefs");
    expect(stored.prefs).toEqual(next);
  });

  it("resets prefs to defaults", async () => {
    await fakeBrowser.storage.sync.set({ prefs: { defaultSort: "domain" } });
    const prefs = await resetPrefs();
    expect(prefs).toEqual(DEFAULT_PREFS);
    const stored = await fakeBrowser.storage.sync.get("prefs");
    expect(stored.prefs).toEqual(DEFAULT_PREFS);
  });
});
