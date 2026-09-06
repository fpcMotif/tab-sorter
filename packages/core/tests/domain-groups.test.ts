import { describe, expect, it } from "vitest";

import { groupByDomain, matchByDomain } from "../domain-groups";
import type { TabLite } from "../types";

const tabs: TabLite[] = [
  {
    id: 1,
    title: "GitHub issue",
    url: "https://github.com/org/repo/issues/1",
    index: 0,
    pinned: false,
  },
  { id: 2, title: "GitHub PR", url: "https://github.com/org/repo/pull/2", index: 1, pinned: false },
  { id: 3, title: "Docs", url: "https://docs.example.com/guide", index: 2, pinned: false },
  { id: 4, title: "Settings", url: "chrome://settings", index: 3, pinned: false },
];

describe("groupByDomain", () => {
  it("groups by domain and sorts by count desc then name", () => {
    expect(groupByDomain(tabs)).toEqual([
      { domain: "github.com", count: 2, tabIds: [1, 2] },
      { domain: "(chrome)", count: 1, tabIds: [4] },
      { domain: "docs.example.com", count: 1, tabIds: [3] },
    ]);
  });
});

describe("matchByDomain", () => {
  it("matches exact domain buckets", () => {
    expect(matchByDomain(tabs, "github.com")).toEqual([1, 2]);
    expect(matchByDomain(tabs, "example.com")).toEqual([]);
  });
});
