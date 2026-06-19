import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS, type Prefs, type RegexPreset, type SortMode, type TabLite } from "./types";

describe("shared types", () => {
  it("accepts the locked tab contract", () => {
    const tab: TabLite = {
      id: 1,
      url: "https://example.com",
      title: "Example",
      index: 0,
      pinned: false,
    };

    expect(tab.id).toBe(1);
  });

  it("keeps prefs and presets explicit", () => {
    const mode: SortMode = "domain";
    const preset: RegexPreset = { label: "Docs", source: "docs", flags: "i" };
    const prefs: Prefs = { ...DEFAULT_PREFS, defaultSort: mode, regexPresets: [preset] };

    expect(prefs).toEqual({
      defaultSort: "domain",
      ignorePinned: true,
      regexPresets: [{ label: "Docs", source: "docs", flags: "i" }],
    });
  });
});
