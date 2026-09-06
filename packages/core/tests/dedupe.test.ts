import { describe, expect, it } from "vitest";

import { normalizeUrl, planDedupe, type DedupeOptions } from "../dedupe";
import type { TabLite } from "../types";

function tab(id: number, url: string, index = id, pinned = false): TabLite {
  return { id, title: `T${id}`, url, index, pinned };
}

const KEEP_ALL: DedupeOptions = { ignoreHash: false, ignoreQuery: false };

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("normalizeUrl", () => {
  it("keeps or strips query/hash across all four opt combinations", () => {
    const url = "https://x.com/path?q=1#frag";

    expect(normalizeUrl(url, { ignoreHash: false, ignoreQuery: false })).toBe(
      "https://x.com/path?q=1#frag",
    );
    expect(normalizeUrl(url, { ignoreHash: true, ignoreQuery: false })).toBe(
      "https://x.com/path?q=1",
    );
    expect(normalizeUrl(url, { ignoreHash: false, ignoreQuery: true })).toBe(
      "https://x.com/path#frag",
    );
    expect(normalizeUrl(url, { ignoreHash: true, ignoreQuery: true })).toBe("https://x.com/path");
  });

  it("lower-cases the host and drops a trailing slash, collapsing root '/' to ''", () => {
    expect(normalizeUrl("https://EXAMPLE.com/Foo/", KEEP_ALL)).toBe(
      normalizeUrl("https://example.com/Foo", KEEP_ALL),
    );
    expect(normalizeUrl("https://example.com/", KEEP_ALL)).toBe(
      normalizeUrl("https://example.com", KEEP_ALL),
    );
    expect(normalizeUrl("https://example.com", KEEP_ALL)).toBe("https://example.com");
  });

  it("does NOT strip a leading www. — dedupe is URL identity, not domain grouping", () => {
    expect(normalizeUrl("https://www.example.com/a", KEEP_ALL)).not.toBe(
      normalizeUrl("https://example.com/a", KEEP_ALL),
    );
  });

  it("treats a default port as equal to no port, but keeps a non-default port distinct", () => {
    expect(normalizeUrl("http://x.com:80/a", KEEP_ALL)).toBe(
      normalizeUrl("http://x.com/a", KEEP_ALL),
    );
    expect(normalizeUrl("http://x.com:8080/a", KEEP_ALL)).not.toBe(
      normalizeUrl("http://x.com/a", KEEP_ALL),
    );
  });

  it("returns undefined for empty/whitespace-only input", () => {
    expect(normalizeUrl("", KEEP_ALL)).toBeUndefined();
    expect(normalizeUrl("   ", KEEP_ALL)).toBeUndefined();
  });

  it("returns undefined for an unparseable url instead of a fallback bucket", () => {
    expect(normalizeUrl("not a url", KEEP_ALL)).toBeUndefined();
  });
});

describe("planDedupe", () => {
  it("returns empty keep/close for empty input", () => {
    expect(planDedupe([], KEEP_ALL)).toEqual({ keep: [], close: [] });
  });

  it("keeps every tab and closes nothing when no URL repeats", () => {
    const tabs = [
      tab(1, "https://a.example/"),
      tab(2, "https://b.example/"),
      tab(3, "https://c.example/"),
    ];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [1, 2, 3], close: [] });
  });

  it("never treats two identical unparseable urls as duplicates", () => {
    const tabs = [tab(1, "not a url"), tab(2, "not a url")];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [1, 2], close: [] });
  });

  it("keeps the lowest-index tab and closes the rest of an unpinned duplicate set", () => {
    const tabs = [
      tab(3, "https://dup.example/"),
      tab(1, "https://dup.example/"),
      tab(2, "https://dup.example/"),
    ];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [1], close: [2, 3] });
  });

  it("lets a pinned duplicate win the keeper slot even over a lower-index unpinned tab", () => {
    const tabs = [tab(1, "https://dup.example/", 1), tab(2, "https://dup.example/", 2, true)];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [2], close: [1] });
  });

  it("never closes a pinned duplicate, even when another pinned tab is the keeper", () => {
    const tabs = [tab(1, "https://dup.example/", 1, true), tab(2, "https://dup.example/", 2, true)];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [1, 2], close: [] });
  });

  it("closes an unpinned duplicate even if its index is lower than every pinned tab's", () => {
    const tabs = [
      tab(1, "https://dup.example/", 1),
      tab(2, "https://dup.example/", 2, true),
      tab(3, "https://dup.example/", 3, true),
    ];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [2, 3], close: [1] });
  });

  it("respects ignoreQuery/ignoreHash when bucketing duplicates", () => {
    const tabs = [tab(1, "https://x.example/p?q=1"), tab(2, "https://x.example/p?q=2")];

    expect(planDedupe(tabs, { ignoreHash: false, ignoreQuery: false })).toEqual({
      keep: [1, 2],
      close: [],
    });
    expect(planDedupe(tabs, { ignoreHash: false, ignoreQuery: true })).toEqual({
      keep: [1],
      close: [2],
    });
  });

  it("orders keep and close ascending by index, not by id", () => {
    const tabs = [
      tab(10, "https://a.example/", 5),
      tab(20, "https://dup.example/", 3),
      tab(30, "https://dup.example/", 1),
      tab(40, "https://b.example/", 0),
      tab(50, "https://dup2.example/", 4),
      tab(60, "https://dup2.example/", 2),
    ];

    expect(planDedupe(tabs, KEEP_ALL)).toEqual({ keep: [40, 30, 60, 10], close: [20, 50] });
  });

  it("partitions every input id into exactly one of keep or close (random tab sets)", () => {
    const URLS = [
      "https://dup.example/a",
      "https://dup.example/a?x=1",
      "https://dup.example/a#h",
      "https://other.example/b",
      "not a url",
      "",
    ];
    const rng = mulberry32(42);
    const opts: DedupeOptions = { ignoreHash: rng() < 0.5, ignoreQuery: rng() < 0.5 };

    for (let trial = 0; trial < 200; trial += 1) {
      const n = 1 + Math.floor(rng() * 10);
      const tabs = Array.from({ length: n }, (_value, i) => {
        const id = i + 1;
        return tab(id, URLS[Math.floor(rng() * URLS.length)]!, id, rng() < 0.3);
      });

      const { keep, close } = planDedupe(tabs, opts);
      const ids = tabs.map((t) => t.id);

      expect([...keep, ...close].toSorted((a, b) => a - b)).toEqual(ids.toSorted((a, b) => a - b));
      expect(new Set([...keep, ...close]).size).toBe(ids.length);

      // Never-close invariant: no pinned tab id may appear in close.
      const pinnedIds = new Set(tabs.filter((t) => t.pinned).map((t) => t.id));
      expect(close.some((id) => pinnedIds.has(id))).toBe(false);
    }
  });
});
