import { describe, expect, it } from "vitest";

import { getDomain } from "./domain";
import { groupByDomain } from "./domain-groups";
import { planWindowOrder } from "./plan";
import { sortByDomain, sortByTitle } from "./sort";
import { planMoves, type TabMove } from "./tab-moves";
import type { SortMode, TabLite } from "@tab-sorter/core/types";

// Property-based discovery suite. Where the per-module tests pin specific
// examples, this file fuzzes each pure core against the invariants it must hold
// for EVERY input — the cheapest way to surface an edge case nobody thought to
// write down. A seeded PRNG keeps every failure reproducible: a red run points
// at one fixed case, never a once-in-a-thousand flake.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }

  return copy;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function ascending(values: number[]): string {
  return values.toSorted((a, b) => a - b).join(",");
}

function isPermutationOf(result: number[], source: number[]): boolean {
  return result.length === source.length && ascending(result) === ascending(source);
}

// A deliberately nasty pool: mixed case, www., trailing dots, ports, credentials,
// special schemes, duplicate titles/urls, blank strings, and non-URLs.
const TITLES = ["Alpha", "alpha", "beta", "Issue 2", "Issue 10", "Zeta", "", "  spaced  ", "ALPHA"];
const URLS = [
  "https://github.com/a",
  "https://github.com/b",
  "https://docs.example.com/x",
  "https://blog.example.com/y",
  "https://example.com.",
  "https://WWW.Example.com/z",
  "https://user:pass@www.example.com/",
  "https://example.com:8443/p",
  "chrome://settings",
  "about:blank",
  "file:///tmp/z",
  "not a url",
  "",
];

function randomTabs(rng: () => number, n: number): TabLite[] {
  return Array.from({ length: n }, (_value, i) => ({
    id: i + 1,
    title: pick(TITLES, rng),
    url: pick(URLS, rng),
    index: i,
    pinned: rng() < 0.35,
  }));
}

describe("getDomain — fuzz invariants", () => {
  it("never throws and always yields a non-empty bucket for arbitrary input", () => {
    const rng = mulberry32(1);
    const junk = "abc :/?.#@[]%\\ABZ09-www.";

    for (let k = 0; k < 3000; k += 1) {
      let url = pick(URLS, rng);
      const extra = Math.floor(rng() * 14);
      for (let i = 0; i < extra; i += 1) {
        url += junk[Math.floor(rng() * junk.length)]!;
      }

      const domain = getDomain(url);

      expect(typeof domain).toBe("string");
      expect(domain.length).toBeGreaterThan(0);
      // Pure function: a second call must agree with the first.
      expect(getDomain(url)).toBe(domain);
    }
  });

  it("collapses case, leading www., trailing dot, port, and credentials to one bucket", () => {
    expect(getDomain("https://WWW.Example.COM.:8443/p?q=1#h")).toBe("example.com");
    expect(getDomain("https://user:pass@www.example.com/")).toBe("example.com");
    expect(getDomain("https://example.com.")).toBe(getDomain("https://example.com"));
  });

  it("never lets a resolved host keep a leading www. or trailing dot", () => {
    const rng = mulberry32(2);

    for (let k = 0; k < 1000; k += 1) {
      const host = `${pick(["www.", "WWW.", "", "blog."], rng)}example${pick([".com", ".com.", ".io"], rng)}`;
      const domain = getDomain(`https://${host}/path`);

      expect(domain.startsWith("www.")).toBe(false);
      expect(domain.endsWith(".")).toBe(false);
    }
  });
});

for (const [name, sortFn] of Object.entries({ sortByTitle, sortByDomain })) {
  describe(`${name} — sort invariants`, () => {
    it("returns a permutation of the input ids (no tab dropped or duplicated)", () => {
      const rng = mulberry32(7);

      for (let k = 0; k < 600; k += 1) {
        const tabs = randomTabs(rng, 1 + Math.floor(rng() * 9));

        expect(
          isPermutationOf(
            sortFn(tabs),
            tabs.map((t) => t.id),
          ),
        ).toBe(true);
      }
    });

    it("is order-independent: a total order means shuffling the input cannot change the output", () => {
      const rng = mulberry32(8);

      for (let k = 0; k < 600; k += 1) {
        const tabs = randomTabs(rng, 1 + Math.floor(rng() * 9));
        const ordered = sortFn(tabs);

        expect(sortFn(shuffled(tabs, rng))).toEqual(ordered);
      }
    });
  });
}

const MODES: SortMode[] = ["title", "domain"];

describe("planWindowOrder — pinned-aware invariants", () => {
  it("permutes ids, keeps the whole pinned block ahead of unpinned, and composes per region", () => {
    const rng = mulberry32(11);

    for (let k = 0; k < 1500; k += 1) {
      const tabs = randomTabs(rng, 1 + Math.floor(rng() * 9));
      const mode = pick(MODES, rng);
      const ignorePinned = rng() < 0.5;
      const order = planWindowOrder(tabs, mode, ignorePinned);
      const pinnedIds = new Set(tabs.filter((t) => t.pinned).map((t) => t.id));

      expect(
        isPermutationOf(
          order,
          tabs.map((t) => t.id),
        ),
      ).toBe(true);

      // The load-bearing invariant: every pinned id precedes every unpinned id.
      // Chrome silently clamps any move that crosses this boundary.
      const lastPinned = Math.max(-1, ...order.map((id, i) => (pinnedIds.has(id) ? i : -1)));
      const firstUnpinned = Math.min(
        order.length,
        ...order.map((id, i) => (pinnedIds.has(id) ? order.length : i)),
      );
      expect(lastPinned).toBeLessThan(firstUnpinned);

      // Each region is exactly its own sort; ignorePinned freezes the pinned order.
      const sorter = mode === "title" ? sortByTitle : sortByDomain;
      const pinned = tabs.filter((t) => t.pinned);
      const unpinned = tabs.filter((t) => !t.pinned);

      expect(order.filter((id) => !pinnedIds.has(id))).toEqual(sorter(unpinned));
      expect(order.filter((id) => pinnedIds.has(id))).toEqual(
        ignorePinned ? pinned.map((t) => t.id) : sorter(pinned),
      );
    }
  });
});

describe("groupByDomain — grouping invariants", () => {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  it("conserves every tab, ranks by count desc then domain, and keeps encounter order", () => {
    const rng = mulberry32(13);

    for (let k = 0; k < 600; k += 1) {
      const tabs = randomTabs(rng, 1 + Math.floor(rng() * 12));
      const groups = groupByDomain(tabs);

      // Conservation: no tab lost, no tab invented, count matches its id list.
      expect(
        isPermutationOf(
          groups.flatMap((g) => g.tabIds),
          tabs.map((t) => t.id),
        ),
      ).toBe(true);
      expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(tabs.length);
      for (const group of groups) {
        expect(group.count).toBe(group.tabIds.length);
      }

      // Ordering: most-populated first; ties broken by the same collator the source uses.
      for (let i = 1; i < groups.length; i += 1) {
        const prev = groups[i - 1]!;
        const cur = groups[i]!;

        expect(prev.count).toBeGreaterThanOrEqual(cur.count);
        if (prev.count === cur.count) {
          expect(collator.compare(prev.domain, cur.domain)).toBeLessThanOrEqual(0);
        }
      }

      // Within a group, ids appear in the order the tabs were encountered.
      for (const group of groups) {
        const encountered = tabs.filter((t) => getDomain(t.url) === group.domain).map((t) => t.id);

        expect(group.tabIds).toEqual(encountered);
      }
    }
  });
});

function lisLength(values: number[]): number {
  const length = values.map(() => 1);
  let best = 0;

  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j]! < values[i]!) {
        length[i] = Math.max(length[i]!, length[j]! + 1);
      }
    }
    best = Math.max(best, length[i]!);
  }

  return best;
}

function replay(start: number[], moves: TabMove[]): number[] {
  const strip = [...start];

  for (const { id, index } of moves) {
    strip.splice(strip.indexOf(id), 1);
    strip.splice(index, 0, id);
  }

  return strip;
}

describe("planMoves — minimal & correct beyond the exhaustive range", () => {
  it("reaches the target with exactly n - LIS moves for random permutations up to n=14", () => {
    const rng = mulberry32(17);

    for (let n = 8; n <= 14; n += 1) {
      const target = Array.from({ length: n }, (_value, i) => i);

      for (let trial = 0; trial < 40; trial += 1) {
        const current = shuffled(target, rng);
        const moves = planMoves(current, target);

        expect(replay(current, moves)).toEqual(target);
        expect(moves).toHaveLength(n - lisLength(current));
      }
    }
  });
});
