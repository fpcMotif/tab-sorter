import { describe, expect, it } from "vitest";

import { groupByDomain, matchByDomain, matchByRegex } from "../match.ts";
import { InvalidPatternError, type TabLite } from "../types.ts";

function makeTabs(
  items: Array<Partial<TabLite> & { id: number; title: string; url: string }>,
): TabLite[] {
  return items.map((item, index) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    index: item.index ?? index,
    pinned: item.pinned ?? false,
  }));
}

describe("groupByDomain", () => {
  it("returns empty array for no tabs", () => {
    expect(groupByDomain([])).toEqual([]);
  });

  it("groups by domain with counts", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://github.com/a" },
      { id: 2, title: "B", url: "https://github.com/b" },
      { id: 3, title: "C", url: "https://example.com/c" },
    ]);
    const groups = groupByDomain(tabs);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ domain: "github.com", count: 2, tabIds: [1, 2] });
    expect(groups[1]).toEqual({ domain: "example.com", count: 1, tabIds: [3] });
  });

  it("sorts by count descending then domain ascending", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://example.com/a" },
      { id: 2, title: "B", url: "https://github.com/b" },
      { id: 3, title: "C", url: "https://github.com/c" },
      { id: 4, title: "D", url: "https://gitlab.com/d" },
    ]);
    const groups = groupByDomain(tabs);
    expect(groups.map((g) => g.domain)).toEqual(["github.com", "example.com", "gitlab.com"]);
  });
});

describe("matchByDomain", () => {
  it("returns empty array for no tabs", () => {
    expect(matchByDomain([], "example.com")).toEqual([]);
  });

  it("matches exact domain", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://example.com/a" },
      { id: 2, title: "B", url: "https://github.com/b" },
      { id: 3, title: "C", url: "https://www.example.com/c" },
    ]);
    expect(matchByDomain(tabs, "example.com")).toEqual([1, 3]);
  });

  it("is case-insensitive", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://Example.COM/a" },
    ]);
    expect(matchByDomain(tabs, "example.com")).toEqual([1]);
  });
});

describe("matchByRegex", () => {
  it("returns empty array for no tabs", () => {
    expect(matchByRegex([], "test")).toEqual([]);
  });

  it("matches against title", () => {
    const tabs = makeTabs([
      { id: 1, title: "GitHub Issues", url: "https://github.com/a" },
      { id: 2, title: "Example", url: "https://example.com/b" },
    ]);
    expect(matchByRegex(tabs, "GitHub")).toEqual([1]);
  });

  it("matches against URL", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://github.com/a" },
      { id: 2, title: "B", url: "https://example.com/b" },
    ]);
    expect(matchByRegex(tabs, "example\\.com")).toEqual([2]);
  });

  it("matches across title and URL with newline", () => {
    const tabs = makeTabs([
      { id: 1, title: "example.com", url: "https://github.com/a" },
      { id: 2, title: "A", url: "https://example.com/b" },
    ]);
    expect(matchByRegex(tabs, "^example\\.com$")).toEqual([1]);
  });

  it("throws InvalidPatternError for invalid regex", () => {
    const tabs = makeTabs([{ id: 1, title: "A", url: "https://a.com" }]);
    expect(() => matchByRegex(tabs, "[")).toThrow(InvalidPatternError);
  });

  it("honors flags", () => {
    const tabs = makeTabs([
      { id: 1, title: "GitHub", url: "https://a.com" },
      { id: 2, title: "github", url: "https://b.com" },
    ]);
    expect(matchByRegex(tabs, "GITHUB", "")).toEqual([1]);
    expect(matchByRegex(tabs, "GITHUB", "i")).toEqual([1, 2]);
  });
});
