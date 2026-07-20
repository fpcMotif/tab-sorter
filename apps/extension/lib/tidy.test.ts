import { describe, expect, it } from "vitest";

import { planTidy } from "./tidy";
import { TAB_GROUP_NONE } from "@tab-sorter/core/types";
import type { GroupOrder, Prefs, TabLite } from "@tab-sorter/core/types";

type TidyPrefs = Pick<
  Prefs,
  "minGroupSize" | "groupOrder" | "collapseAfterTidy" | "regroupExisting"
>;

const basePrefs: TidyPrefs = {
  minGroupSize: 2,
  groupOrder: "alpha",
  collapseAfterTidy: false,
  regroupExisting: false,
};

function tab(
  id: number,
  title: string,
  url: string,
  opts: { pinned?: boolean; groupId?: number } = {},
): TabLite {
  return { id, title, url, index: id, pinned: opts.pinned ?? false, groupId: opts.groupId };
}

describe("planTidy — pinned boundary", () => {
  it("keeps pinned tabs as a frozen prefix in their original relative order", () => {
    const tabs = [
      tab(9, "Zed pinned", "https://pinned-z.example", { pinned: true }),
      tab(2, "Beta", "https://a.example/b"),
      tab(5, "Ace pinned", "https://pinned-a.example", { pinned: true }),
      tab(1, "Alpha", "https://a.example/a"),
    ];

    const plan = planTidy(tabs, basePrefs);

    // Pinned ids 9, 5 keep THEIR OWN encounter order — never re-sorted alphabetically.
    expect(plan.order.slice(0, 2)).toEqual([9, 5]);
  });

  it("never places a pinned id inside any GroupSpec", () => {
    const tabs = [
      tab(1, "Pinned a.example", "https://a.example/pinned", { pinned: true }),
      tab(2, "Alpha", "https://a.example/x"),
      tab(3, "Bravo", "https://a.example/y"),
    ];

    const plan = planTidy(tabs, basePrefs);
    const pinnedIds = new Set([1]);

    for (const group of plan.groups) {
      for (const id of group.tabIds) {
        expect(pinnedIds.has(id)).toBe(false);
      }
    }
    expect(plan.groups.flatMap((g) => g.tabIds)).toEqual([2, 3]);
  });
});

describe("planTidy — order shape", () => {
  it("produces an order that is a permutation of the input ids", () => {
    const tabs = [
      tab(1, "Pinned", "https://p.example", { pinned: true }),
      tab(2, "Alpha", "https://a.example/1"),
      tab(3, "Beta", "https://a.example/2"),
      tab(4, "Gamma", "https://b.example/1"),
    ];

    const plan = planTidy(tabs, basePrefs);

    expect(plan.order.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("keeps every GroupSpec.tabIds as a contiguous slice of order", () => {
    const tabs = [
      tab(1, "Solo", "https://solo.example"),
      tab(2, "Alpha", "https://a.example/1"),
      tab(3, "Beta", "https://a.example/2"),
      tab(4, "Gamma", "https://b.example/1"),
      tab(5, "Delta", "https://b.example/2"),
    ];

    const plan = planTidy(tabs, basePrefs);

    for (const group of plan.groups) {
      const start = plan.order.indexOf(group.tabIds[0]!);
      expect(plan.order.slice(start, start + group.tabIds.length)).toEqual(group.tabIds);
    }
    expect(plan.groups.length).toBeGreaterThan(0);
  });

  it("places leftover claimed tabs (below minGroupSize) after the new groups, sorted by title", () => {
    const tabs = [
      tab(1, "Zed leftover", "https://lonely-z.example"),
      tab(2, "Alpha", "https://a.example/1"),
      tab(3, "Beta", "https://a.example/2"),
      tab(4, "Ace leftover", "https://lonely-a.example"),
    ];

    const plan = planTidy(tabs, basePrefs);

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.tabIds).toEqual([2, 3]);
    // Two singleton domains ("lonely-z", "lonely-a") tie-broken by title: Ace < Zed.
    expect(plan.order.slice(2)).toEqual([4, 1]);
  });
});

describe("planTidy — minGroupSize boundary", () => {
  it("groups a bucket exactly at minGroupSize and leaves one below it a single", () => {
    const tabs = [
      tab(1, "Alpha", "https://a.example/1"),
      tab(2, "Beta", "https://a.example/2"),
      tab(3, "Gamma", "https://a.example/3"),
      tab(4, "Solo", "https://b.example/1"),
    ];

    const plan = planTidy(tabs, { ...basePrefs, minGroupSize: 3 });

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.key).toBe("a.example");
    expect(plan.groups[0]!.tabIds).toEqual([1, 2, 3]);
    // b.example has only 1 tab (< 3): stays an ungrouped leftover single.
    expect(plan.order).toEqual([1, 2, 3, 4]);
  });
});

describe("planTidy — groupOrder", () => {
  it("orders new groups alphabetically by domain when groupOrder is 'alpha'", () => {
    const tabs = [
      tab(1, "Z1", "https://zzz.example/1"),
      tab(2, "Z2", "https://zzz.example/2"),
      tab(3, "A1", "https://aaa.example/1"),
      tab(4, "A2", "https://aaa.example/2"),
      tab(5, "M1", "https://mmm.example/1"),
      tab(6, "M2", "https://mmm.example/2"),
    ];

    const plan = planTidy(tabs, { ...basePrefs, groupOrder: "alpha" });

    expect(plan.groups.map((g) => g.key)).toEqual(["aaa.example", "mmm.example", "zzz.example"]);
  });

  it("orders new groups by size desc when groupOrder is 'sizeDesc', ties broken alpha", () => {
    const tabs = [
      tab(1, "Z1", "https://zzz.example/1"),
      tab(2, "Z2", "https://zzz.example/2"),
      tab(3, "Z3", "https://zzz.example/3"),
      tab(4, "A1", "https://aaa.example/1"),
      tab(5, "A2", "https://aaa.example/2"),
      tab(6, "M1", "https://mmm.example/1"),
      tab(7, "M2", "https://mmm.example/2"),
    ];

    const plan = planTidy(tabs, { ...basePrefs, groupOrder: "sizeDesc" });

    // zzz.example (3) first; aaa.example and mmm.example tie at 2, alpha breaks the tie.
    expect(plan.groups.map((g) => g.key)).toEqual(["zzz.example", "aaa.example", "mmm.example"]);
  });
});

describe("planTidy — collapseAfterTidy", () => {
  it("propagates collapseAfterTidy onto every new GroupSpec", () => {
    const tabs = [
      tab(1, "Alpha", "https://a.example/1"),
      tab(2, "Beta", "https://a.example/2"),
      tab(3, "Gamma", "https://b.example/1"),
      tab(4, "Delta", "https://b.example/2"),
    ];

    const collapsed = planTidy(tabs, { ...basePrefs, collapseAfterTidy: true });
    const expanded = planTidy(tabs, { ...basePrefs, collapseAfterTidy: false });

    expect(collapsed.groups.every((g) => g.collapsed)).toBe(true);
    expect(expanded.groups.every((g) => !g.collapsed)).toBe(true);
  });
});

describe("planTidy — regroupExisting", () => {
  it("false: leaves existing groups as untouched atomic blocks placed first, with no ungroup entries", () => {
    const tabs = [
      tab(1, "Pinned", "https://p.example", { pinned: true }),
      tab(2, "X1", "https://z.example/1", { groupId: 100 }),
      tab(3, "X2", "https://z.example/2", { groupId: 100 }),
      tab(4, "Y1", "https://q.example/1", { groupId: 200 }),
      tab(5, "Beta new", "https://a.example/1"),
      tab(6, "Alpha new", "https://a.example/2"),
      tab(7, "Lonely new", "https://lonely.example"),
    ];

    const plan = planTidy(tabs, basePrefs);

    // Pinned prefix, then the existing blocks untouched and in their original order.
    expect(plan.order.slice(0, 4)).toEqual([1, 2, 3, 4]);
    // The new group from the freshly-claimed a.example tabs, sorted by title.
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.key).toBe("a.example");
    expect(plan.groups[0]!.tabIds).toEqual([6, 5]);
    // Leftover single (lonely.example) after the new group.
    expect(plan.order.slice(4)).toEqual([6, 5, 7]);
    expect(plan.ungroup).toEqual([]);
  });

  it("true: dissolves old groups, buckets ALL unpinned tabs, and reports leftover-single ungroup ids", () => {
    const tabs = [
      tab(1, "Pinned", "https://p.example", { pinned: true }),
      tab(2, "A1", "https://a.example/1"),
      tab(3, "A2", "https://a.example/2"),
      // Previously grouped, but its domain (a.example) still forms a new group ⇒ no ungroup entry.
      tab(4, "A3 was grouped", "https://a.example/3", { groupId: 7 }),
      // Previously grouped alone; its domain (b.example) has only 1 claimed tab ⇒ leftover ⇒ ungroup.
      tab(5, "B1 was grouped", "https://b.example/1", { groupId: 5 }),
      // Previously grouped alone; its domain (c.example) has only 1 claimed tab ⇒ leftover ⇒ ungroup.
      tab(6, "C1 was grouped", "https://c.example/1", { groupId: 9 }),
    ];

    const plan = planTidy(tabs, { ...basePrefs, regroupExisting: true });

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.key).toBe("a.example");
    expect(plan.groups[0]!.tabIds).toEqual([2, 3, 4]);
    // b.example / c.example each have exactly one claimed tab ⇒ leftover singles.
    expect(plan.order.slice(1)).toEqual([2, 3, 4, 5, 6]);
    // Only the previously-grouped leftovers need an explicit ungroup; id 4 joined a
    // new group and needs none.
    expect(plan.ungroup.toSorted((a, b) => a - b)).toEqual([5, 6]);
  });
});

describe("planTidy — degenerate windows", () => {
  it("returns an all-empty plan for an empty window", () => {
    expect(planTidy([], basePrefs)).toEqual({ order: [], groups: [], ungroup: [], close: [] });
  });

  it("leaves an all-pinned window's order untouched and creates no groups", () => {
    const tabs = [
      tab(2, "Zed", "https://z.example", { pinned: true }),
      tab(1, "Alpha", "https://a.example", { pinned: true }),
    ];

    const plan = planTidy(tabs, basePrefs);

    expect(plan.order).toEqual([2, 1]);
    expect(plan.groups).toEqual([]);
    expect(plan.ungroup).toEqual([]);
    expect(plan.close).toEqual([]);
  });
});

// Property-based discovery suite (the invariants.test.ts / plan.test.ts spirit). A
// seeded PRNG keeps every failure reproducible: a red run points at one fixed case.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

const DOMAIN_URLS = [
  "https://alpha.example/x",
  "https://bravo.example/y",
  "https://charlie.example/z",
  "https://delta.example/w",
];
const GROUP_IDS: (number | undefined)[] = [undefined, 10, 20, 30];
const GROUP_ORDERS: GroupOrder[] = ["alpha", "sizeDesc"];

function randomWindow(rng: () => number, n: number): TabLite[] {
  return Array.from({ length: n }, (_value, i) => {
    const pinned = rng() < 0.25;

    return {
      id: i + 1,
      title: `T${i + 1}-${Math.floor(rng() * 5)}`,
      url: pick(DOMAIN_URLS, rng),
      index: i,
      pinned,
      groupId: pinned ? undefined : pick(GROUP_IDS, rng),
    };
  });
}

describe("planTidy — property invariants over random windows", () => {
  it("holds the pinned-prefix, permutation, contiguous-group, and ungroup invariants", () => {
    const rng = mulberry32(2026);

    for (let trial = 0; trial < 500; trial += 1) {
      const tabs = randomWindow(rng, 1 + Math.floor(rng() * 12));
      const prefs: TidyPrefs = {
        minGroupSize: 1 + Math.floor(rng() * 3),
        groupOrder: pick(GROUP_ORDERS, rng),
        collapseAfterTidy: rng() < 0.5,
        regroupExisting: rng() < 0.5,
      };

      const plan = planTidy(tabs, prefs);
      const ids = tabs.map((t) => t.id);

      expect(isPermutationOf(plan.order, ids)).toBe(true);
      expect(plan.close).toEqual([]);

      // Pinned ids precede unpinned ids, in their own original relative order.
      const pinnedIds = tabs.filter((t) => t.pinned).map((t) => t.id);
      const pinnedSet = new Set(pinnedIds);
      expect(plan.order.slice(0, pinnedIds.length)).toEqual(pinnedIds);

      for (const group of plan.groups) {
        expect(group.tabIds.length).toBeGreaterThanOrEqual(prefs.minGroupSize);
        expect(group.collapsed).toBe(prefs.collapseAfterTidy);
        for (const id of group.tabIds) {
          expect(pinnedSet.has(id)).toBe(false);
        }

        // Every GroupSpec.tabIds is a contiguous slice of order.
        const start = plan.order.indexOf(group.tabIds[0]!);
        expect(plan.order.slice(start, start + group.tabIds.length)).toEqual(group.tabIds);
      }

      if (!prefs.regroupExisting) {
        expect(plan.ungroup).toEqual([]);
      } else {
        const groupedMemberIds = new Set(plan.groups.flatMap((g) => g.tabIds));
        for (const id of plan.ungroup) {
          const original = tabs.find((t) => t.id === id)!;
          expect((original.groupId ?? TAB_GROUP_NONE) !== TAB_GROUP_NONE).toBe(true);
          expect(groupedMemberIds.has(id)).toBe(false);
        }
      }
    }
  });
});
