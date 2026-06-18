import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultPrefs, getPrefs, normalizePrefs, setPrefs } from "./storage";
import type { Prefs } from "./types";

const globalWithBrowser = globalThis as typeof globalThis & {
  browser?: {
    storage: {
      sync: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
    };
  };
};

function getMockStorage() {
  if (!globalWithBrowser.browser) {
    throw new Error("Mock browser was not initialized");
  }

  return globalWithBrowser.browser.storage.sync;
}

describe("storage", () => {
  beforeEach(() => {
    globalWithBrowser.browser = {
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it("normalizes missing and partial preferences", () => {
    expect(normalizePrefs(undefined)).toEqual(defaultPrefs);
    expect(normalizePrefs({ defaultSort: "domain" })).toEqual({
      ...defaultPrefs,
      defaultSort: "domain",
    });
  });

  it("loads prefs from sync storage", async () => {
    getMockStorage().get.mockResolvedValue({
      prefs: { defaultSort: "domain", ignorePinned: false, regexPresets: [{ label: "GitHub", source: "github", flags: "i" }] },
    });

    await expect(getPrefs()).resolves.toEqual({
      defaultSort: "domain",
      ignorePinned: false,
      regexPresets: [{ label: "GitHub", source: "github", flags: "i" }],
    });
  });

  it("saves normalized prefs to sync storage", async () => {
    const prefs: Prefs = { defaultSort: "title", ignorePinned: true, regexPresets: [] };

    await setPrefs(prefs);

    expect(getMockStorage().set).toHaveBeenCalledWith({ prefs });
  });
});
