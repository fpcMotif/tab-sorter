import { beforeEach, describe, expect, it, vi } from "vitest";

// Wrap the real getDomain in a spy so we can count how often each consumer
// re-parses a URL. getDomain builds a `new URL(...)` every call, so re-resolving
// the same tab inside a comparator is pure wasted work that scales with
// comparisons (~n log n) instead of tabs (n). These tests pin the work at one
// resolution per tab and fail the moment a refactor reintroduces inline parsing.
vi.mock("./domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domain")>();

  return { getDomain: vi.fn(actual.getDomain) };
});

import { getDomain } from "./domain";
import { groupByDomain, matchByDomain } from "./match";
import { sortByDomain } from "./sort";
import type { TabLite } from "./types";

const getDomainSpy = vi.mocked(getDomain);

// Many tabs, many domains, deliberately unsorted so the comparator does real work.
const URLS = [
  "https://github.com/a",
  "https://docs.example.com/1",
  "https://blog.example.com/2",
  "https://news.ycombinator.com/3",
  "https://github.com/b",
  "https://example.org/4",
  "https://docs.example.com/5",
  "chrome://settings",
  "https://a.test/6",
  "https://z.test/7",
  "https://github.com/c",
  "https://blog.example.com/8",
  "https://example.org/9",
  "https://m.test/10",
  "https://docs.example.com/11",
  "https://n.test/12",
];

const tabs: TabLite[] = URLS.map((url, i) => ({
  id: i + 1,
  title: `Tab ${URLS.length - i}`,
  url,
  index: i,
  pinned: false,
}));

describe("domain resolution is not wasted", () => {
  beforeEach(() => {
    getDomainSpy.mockClear();
  });

  it("sortByDomain resolves each tab's domain exactly once — not once per comparison", () => {
    sortByDomain(tabs);

    expect(getDomainSpy).toHaveBeenCalledTimes(tabs.length);
  });

  it("groupByDomain resolves each tab's domain exactly once", () => {
    groupByDomain(tabs);

    expect(getDomainSpy).toHaveBeenCalledTimes(tabs.length);
  });

  it("matchByDomain resolves each tab's domain exactly once", () => {
    matchByDomain(tabs, "github.com");

    expect(getDomainSpy).toHaveBeenCalledTimes(tabs.length);
  });
});
