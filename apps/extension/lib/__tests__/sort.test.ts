import { describe, expect, it } from "vitest";

import { sortByDomain, sortByTitle } from "../sort.ts";
import type { TabLite } from "../types.ts";

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

describe("sortByTitle", () => {
  it("returns empty array for no tabs", () => {
    expect(sortByTitle([])).toEqual([]);
  });

  it("returns single tab id", () => {
    expect(sortByTitle(makeTabs([{ id: 1, title: "Only", url: "https://a.com" }]))).toEqual([1]);
  });

  it("sorts alphabetically by title", () => {
    const tabs = makeTabs([
      { id: 1, title: "Zebra", url: "https://z.com" },
      { id: 2, title: "Apple", url: "https://a.com" },
      { id: 3, title: "Mango", url: "https://m.com" },
    ]);
    expect(sortByTitle(tabs)).toEqual([2, 3, 1]);
  });

  it("uses numeric collation", () => {
    const tabs = makeTabs([
      { id: 1, title: "Item 10", url: "https://a.com/10" },
      { id: 2, title: "Item 2", url: "https://a.com/2" },
      { id: 3, title: "Item 1", url: "https://a.com/1" },
    ]);
    expect(sortByTitle(tabs)).toEqual([3, 2, 1]);
  });

  it("uses URL as tiebreaker", () => {
    const tabs = makeTabs([
      { id: 1, title: "Same", url: "https://b.com" },
      { id: 2, title: "Same", url: "https://a.com" },
    ]);
    expect(sortByTitle(tabs)).toEqual([2, 1]);
  });

  it("does not mutate input", () => {
    const tabs = makeTabs([
      { id: 1, title: "B", url: "https://b.com" },
      { id: 2, title: "A", url: "https://a.com" },
    ]);
    const original = tabs.map((t) => t.id);
    sortByTitle(tabs);
    expect(tabs.map((t) => t.id)).toEqual(original);
  });
});

describe("sortByDomain", () => {
  it("returns empty array for no tabs", () => {
    expect(sortByDomain([])).toEqual([]);
  });

  it("groups by domain then sorts by title", () => {
    const tabs = makeTabs([
      { id: 1, title: "Zeta", url: "https://beta.com/z" },
      { id: 2, title: "Alpha", url: "https://alpha.com/a" },
      { id: 3, title: "Beta", url: "https://alpha.com/b" },
      { id: 4, title: "Apple", url: "https://beta.com/a" },
    ]);
    expect(sortByDomain(tabs)).toEqual([2, 3, 4, 1]);
  });

  it("puts scheme buckets before real domains alphabetically", () => {
    const tabs = makeTabs([
      { id: 1, title: "Chrome", url: "chrome://extensions" },
      { id: 2, title: "Site", url: "https://example.com" },
    ]);
    expect(sortByDomain(tabs)).toEqual([1, 2]);
  });

  it("strips www. when grouping", () => {
    const tabs = makeTabs([
      { id: 1, title: "A", url: "https://www.example.com/a" },
      { id: 2, title: "B", url: "https://example.com/b" },
    ]);
    expect(sortByDomain(tabs)).toEqual([1, 2]);
  });
});
