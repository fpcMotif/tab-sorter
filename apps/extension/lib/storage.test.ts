import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPrefs, setPrefs } from "./storage";

describe("prefs storage", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal("browser", fakeBrowser);
  });

  it("returns defaults when storage is empty", async () => {
    await expect(getPrefs()).resolves.toEqual({
      defaultSort: "title",
      ignorePinned: true,
      regexPresets: [],
    });
  });

  it("merges partial updates", async () => {
    await setPrefs({ defaultSort: "domain" });
    await setPrefs({ regexPresets: [{ label: "Docs", source: "docs", flags: "i" }] });

    await expect(getPrefs()).resolves.toEqual({
      defaultSort: "domain",
      ignorePinned: true,
      regexPresets: [{ label: "Docs", source: "docs", flags: "i" }],
    });
  });

  it("round-trips stored values", async () => {
    const prefs = await setPrefs({ defaultSort: "domain", ignorePinned: false });

    expect(prefs.defaultSort).toBe("domain");
    await expect(getPrefs()).resolves.toMatchObject({ defaultSort: "domain", ignorePinned: false });
  });
});
