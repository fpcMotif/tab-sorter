import { describe, expect, it } from "vitest";

import { sortByDomain, sortByTitle } from "./sort";
import type { TabLite } from "@tab-sorter/core/types";

const tabs: TabLite[] = [
  {
    id: 1,
    title: "Issue 10",
    url: "https://github.com/org/repo/issues/10",
    index: 0,
    pinned: false,
  },
  { id: 2, title: "Issue 2", url: "https://github.com/org/repo/issues/2", index: 1, pinned: false },
  { id: 3, title: "Alpha", url: "https://docs.example.com/a", index: 2, pinned: false },
  { id: 4, title: "Alpha", url: "https://blog.example.com/a", index: 3, pinned: false },
  { id: 5, title: "Settings", url: "chrome://settings", index: 4, pinned: false },
];

describe("sortByTitle", () => {
  it("sorts titles with numeric collation and URL tie breaks", () => {
    expect(sortByTitle(tabs)).toEqual([4, 3, 2, 1, 5]);
  });

  it("handles empty and single-tab arrays", () => {
    expect(sortByTitle([])).toEqual([]);
    expect(sortByTitle([tabs[0]!])).toEqual([1]);
  });

  it("breaks exact ties by index, then by id", () => {
    const sameTitleAndUrl: TabLite[] = [
      { id: 7, title: "Same", url: "https://same.example/p", index: 5, pinned: false },
      { id: 3, title: "Same", url: "https://same.example/p", index: 2, pinned: false },
    ];
    // equal title + equal url -> lower index wins
    expect(sortByTitle(sameTitleAndUrl)).toEqual([3, 7]);

    const sameThroughIndex: TabLite[] = [
      { id: 7, title: "Same", url: "https://same.example/p", index: 2, pinned: false },
      { id: 3, title: "Same", url: "https://same.example/p", index: 2, pinned: false },
    ];
    // equal title + url + index -> lower id wins
    expect(sortByTitle(sameThroughIndex)).toEqual([3, 7]);
  });
});

describe("sortByDomain", () => {
  it("sorts by domain, then title inside each domain", () => {
    expect(sortByDomain(tabs)).toEqual([5, 4, 3, 2, 1]);
  });

  it("returns valid ids for already sorted input", () => {
    const sorted = [tabs[4]!, tabs[3]!, tabs[2]!];

    expect(sortByDomain(sorted)).toEqual([5, 4, 3]);
  });
});
