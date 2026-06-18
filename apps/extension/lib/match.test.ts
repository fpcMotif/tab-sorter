import { describe, expect, it } from "vitest";

import { groupByDomain, InvalidPatternError, matchByDomain, matchByRegex } from "./match";
import type { TabLite } from "./types";

const tabs: TabLite[] = [
  { id: 1, title: "GitHub Inbox", url: "https://github.com/notifications", index: 0, pinned: false },
  { id: 2, title: "GitHub Pull Request", url: "https://www.github.com/org/repo/pull/1", index: 1, pinned: false },
  { id: 3, title: "Docs", url: "https://developer.chrome.com/docs", index: 2, pinned: false },
  { id: 4, title: "Settings", url: "chrome://extensions", index: 3, pinned: false },
];

describe("groupByDomain", () => {
  it("groups domains by count descending and then name", () => {
    expect(groupByDomain(tabs)).toEqual([
      { domain: "github.com", count: 2, tabIds: [1, 2] },
      { domain: "(chrome)", count: 1, tabIds: [4] },
      { domain: "developer.chrome.com", count: 1, tabIds: [3] },
    ]);
  });
});

describe("matchByDomain", () => {
  it("returns tab ids for an exact normalized domain", () => {
    expect(matchByDomain(tabs, "github.com")).toEqual([1, 2]);
    expect(matchByDomain(tabs, "missing.example")).toEqual([]);
  });
});

describe("matchByRegex", () => {
  it("matches title and URL text", () => {
    expect(matchByRegex(tabs, "pull|chrome", "i")).toEqual([2, 3, 4]);
  });

  it("returns no matches for an empty pattern", () => {
    expect(matchByRegex(tabs, "")).toEqual([]);
  });

  it("throws InvalidPatternError for bad regular expressions", () => {
    expect(() => matchByRegex(tabs, "[")).toThrow(InvalidPatternError);
  });

  it("ignores global and sticky flags so every tab is tested", () => {
    expect(matchByRegex(tabs, "github", "gi")).toEqual([1, 2]);
    expect(matchByRegex(tabs, "github", "y")).toEqual([1, 2]);
  });
});
