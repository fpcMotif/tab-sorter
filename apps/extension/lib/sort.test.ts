import { describe, expect, it } from "vitest";

import { sortByDomain, sortByTitle } from "./sort";
import type { TabLite } from "./types";

const tabs: TabLite[] = [
  { id: 1, title: "Page 10", url: "https://b.example/z", index: 0, pinned: false },
  { id: 2, title: "page 2", url: "https://a.example/b", index: 1, pinned: false },
  { id: 3, title: "Alpha", url: "https://www.b.example/a", index: 2, pinned: false },
  { id: 4, title: "Alpha", url: "https://a.example/a", index: 3, pinned: false },
];

describe("sortByTitle", () => {
  it("sorts by title with numeric and case-insensitive comparison", () => {
    expect(sortByTitle(tabs)).toEqual([4, 3, 2, 1]);
  });
});

describe("sortByDomain", () => {
  it("sorts by normalized domain, then by title within a domain", () => {
    expect(sortByDomain(tabs)).toEqual([4, 2, 3, 1]);
  });
});
