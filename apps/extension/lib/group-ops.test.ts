import { describe, expect, it } from "vitest";

import { type LiveGroup, planGroupOps } from "./group-ops";
import { GROUP_COLORS, type GroupColor, type GroupSpec } from "./types";

function live(
  groupId: number,
  tabIds: number[],
  overrides: Partial<Omit<LiveGroup, "groupId" | "tabIds">> = {},
): LiveGroup {
  return { groupId, title: "Group", color: "grey", collapsed: false, tabIds, ...overrides };
}

function spec(
  key: string,
  tabIds: number[],
  overrides: Partial<Omit<GroupSpec, "key" | "tabIds">> = {},
): GroupSpec {
  return { key, title: "Group", color: "grey", collapsed: false, tabIds, ...overrides };
}

describe("planGroupOps", () => {
  it("emits nothing for a perfect match (same members, same metadata)", () => {
    expect(planGroupOps([live(1, [10, 20])], [spec("g1", [10, 20])])).toEqual([]);
  });

  it("emits only an update when membership matches but metadata differs", () => {
    const l = live(1, [10, 20], { title: "Old", color: "blue", collapsed: true });
    const d = spec("g1", [10, 20], { title: "New", color: "red", collapsed: false });

    expect(planGroupOps([l], [d])).toEqual([
      { type: "update", target: { groupId: 1 }, title: "New", color: "red", collapsed: false },
    ]);
  });

  it("emits a group op with only the missing ids when membership needs additions", () => {
    const l = live(1, [10]);
    const d = spec("g1", [10, 20, 30]);

    expect(planGroupOps([l], [d])).toEqual([{ type: "group", tabIds: [20, 30], groupId: 1 }]);
  });

  it("preserves desired order (not live order) in the group op's added ids", () => {
    const l = live(1, [5]);
    const d = spec("g1", [30, 5, 10, 20]);

    expect(planGroupOps([l], [d])).toEqual([{ type: "group", tabIds: [30, 10, 20], groupId: 1 }]);
  });

  it("emits create then update, in that order, for an unmatched desired group", () => {
    const d = spec("g1", [10, 20], { title: "Fresh", color: "green", collapsed: true });

    expect(planGroupOps([], [d])).toEqual([
      { type: "create", key: "g1", tabIds: [10, 20] },
      { type: "update", target: { key: "g1" }, title: "Fresh", color: "green", collapsed: true },
    ]);
  });

  it("does not match a live group with zero shared members and a different title; the desired group is created fresh", () => {
    const l = live(1, [999], { title: "Old" });
    const d = spec("g1", [1, 2], { title: "New" });

    expect(planGroupOps([l], [d])).toEqual([
      { type: "create", key: "g1", tabIds: [1, 2] },
      { type: "update", target: { key: "g1" }, title: "New", color: "grey", collapsed: false },
    ]);
  });

  it("falls back to the unclaimed live group with an exactly equal title when overlap is zero", () => {
    const l = live(1, [999]); // members closed; same-domain tabs reopened with new ids
    const d = spec("g1", [1, 2]);

    expect(planGroupOps([l], [d])).toEqual([{ type: "group", tabIds: [1, 2], groupId: 1 }]);
  });

  it("prefers overlap over an equal-title fallback: a low-overlap, different-title group wins over a zero-overlap, equal-title group", () => {
    const overlapping = live(1, [10], { title: "Other" }); // overlap 1, different title
    const sameTitle = live(2, [999], { title: "Group" }); // overlap 0, equal title

    const d = spec("g1", [10, 20]); // title "Group"

    expect(planGroupOps([overlapping, sameTitle], [d])).toEqual([
      { type: "group", tabIds: [20], groupId: 1 },
      { type: "update", target: { groupId: 1 }, title: "Group", color: "grey", collapsed: false },
    ]);
  });

  it("title fallback picks the lowest groupId among 3+ zero-overlap, equal-title candidates", () => {
    // Exercises both outcomes of the title-fallback tie-break in one pass: a
    // later candidate with a LOWER groupId (2 < 5) must replace the current
    // titleMatch, and a later candidate with a HIGHER groupId (8 < 2 is
    // false) must not.
    const a = live(5, [900], { title: "Group" });
    const b = live(2, [901], { title: "Group" });
    const c = live(8, [902], { title: "Group" });
    const d = spec("g1", [1, 2]); // zero overlap with all three

    expect(planGroupOps([a, b, c], [d])).toEqual([{ type: "group", tabIds: [1, 2], groupId: 2 }]);
  });

  it("never lets the title fallback claim an already-claimed group", () => {
    // Both live groups share the desired title; groupId 1 gets claimed by
    // overlap first, so the title fallback for the second spec must skip it.
    const claimedByOverlap = live(1, [999]);
    const stillUnclaimed = live(2, [10]);

    const first = spec("g1", [999]); // overlaps `claimedByOverlap`, claims groupId 1
    const second = spec("g2", [1, 2]); // zero overlap anywhere; title matches both live groups

    expect(planGroupOps([claimedByOverlap, stillUnclaimed], [first, second])).toEqual([
      { type: "group", tabIds: [1, 2], groupId: 2 },
    ]);
  });

  it("re-tidy regression: reopening a domain's tabs under new ids reuses the existing same-title group instead of creating a duplicate", () => {
    // "github.com" group's tabs were all closed, then two github.com tabs were
    // reopened with fresh ids. tidy re-derives the same GroupSpec (same key,
    // same title) but its tabIds share nothing with the live group anymore.
    const github = live(1, [111, 222], { title: "github.com" });
    const other = live(2, [50], { title: "example.com" });
    const desired = [
      spec("github.com", [301, 302], { title: "github.com" }),
      spec("example.com", [50], { title: "example.com" }),
    ];

    const ops = planGroupOps([github, other], desired);

    expect(ops.some((op) => op.type === "create")).toBe(false);
    expect(ops).toEqual([{ type: "group", tabIds: [301, 302], groupId: 1 }]);
  });

  it("matches the live group with the greatest member overlap", () => {
    const a = live(1, [10, 20]); // overlap 1 with desired [20, 30, 40]
    const b = live(2, [20, 30]); // overlap 2
    const d = spec("g", [20, 30, 40]);

    expect(planGroupOps([a, b], [d])).toEqual([{ type: "group", tabIds: [40], groupId: 2 }]);
  });

  it("breaks an overlap tie by picking the lowest live groupId", () => {
    const a = live(5, [10]);
    const b = live(2, [10]);
    const d = spec("g", [10, 20]);

    expect(planGroupOps([a, b], [d])).toEqual([{ type: "group", tabIds: [20], groupId: 2 }]);
  });

  it("claims each live group at most once; a second overlapping desired group creates fresh", () => {
    const l = live(1, [10, 20]);
    const first = spec("g1", [10]);
    const second = spec("g2", [20]);

    expect(planGroupOps([l], [first, second])).toEqual([
      { type: "create", key: "g2", tabIds: [20] },
      { type: "update", target: { key: "g2" }, title: "Group", color: "grey", collapsed: false },
    ]);
  });

  it("emits both a group op and an update op, group first, when a matched group needs both", () => {
    const l = live(1, [10], { title: "Old" });
    const d = spec("g1", [10, 20], { title: "New" });

    expect(planGroupOps([l], [d])).toEqual([
      { type: "group", tabIds: [20], groupId: 1 },
      { type: "update", target: { groupId: 1 }, title: "New", color: "grey", collapsed: false },
    ]);
  });

  it("emits ops grouped per desired group, in desired order", () => {
    const l = live(1, [10]);
    const first = spec("g1", [10, 20], { title: "Changed" });
    const second = spec("g2", [99]);

    expect(planGroupOps([l], [first, second])).toEqual([
      { type: "group", tabIds: [20], groupId: 1 },
      { type: "update", target: { groupId: 1 }, title: "Changed", color: "grey", collapsed: false },
      { type: "create", key: "g2", tabIds: [99] },
      { type: "update", target: { key: "g2" }, title: "Group", color: "grey", collapsed: false },
    ]);
  });

  it("creates fresh groups for every desired group when there are no live groups", () => {
    const ops = planGroupOps([], [spec("a", [1]), spec("b", [2])]);

    expect(ops).toEqual([
      { type: "create", key: "a", tabIds: [1] },
      { type: "update", target: { key: "a" }, title: "Group", color: "grey", collapsed: false },
      { type: "create", key: "b", tabIds: [2] },
      { type: "update", target: { key: "b" }, title: "Group", color: "grey", collapsed: false },
    ]);
  });

  it("emits nothing when there are no desired groups", () => {
    expect(planGroupOps([live(1, [10])], [])).toEqual([]);
  });

  it("is deterministic: the same input twice yields deep-equal ops", () => {
    const l = [live(1, [10, 20]), live(2, [30])];
    const d = [spec("g1", [10, 40], { title: "X" }), spec("g2", [30])];

    expect(planGroupOps(l, d)).toEqual(planGroupOps(l, d));
  });
});

// Property-based discovery suite, in the spirit of lib/invariants.test.ts: fuzz
// the reconciler against the one invariant that must hold for EVERY input —
// every desired member is accounted for exactly once, either by the live group
// it was matched to (untouched or topped up) or by a freshly created group.
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

// Model-based fuzz: build each desired group with a KNOWN intended relationship
// to a live group (or none), using globally-unique ids so overlap can never be
// ambiguous, then assert the exact ops that relationship implies. This is what
// makes the property checkable without re-deriving bestMatch's own tie-break logic.
describe("planGroupOps — conservation invariant", () => {
  it("emits exactly the add/update ops each desired group's construction implies, and nothing for untouched leftovers", () => {
    const rng = mulberry32(29);

    for (let trial = 0; trial < 500; trial += 1) {
      let nextId = 1;
      const freshIds = (n: number): number[] => Array.from({ length: n }, () => nextId++);

      const liveGroups: LiveGroup[] = [];
      for (let g = 0; g < Math.floor(rng() * 5); g += 1) {
        const size = 1 + Math.floor(rng() * 3);
        liveGroups.push(
          live(g + 1, freshIds(size), {
            title: `L${g}`,
            color: pick(GROUP_COLORS, rng),
            collapsed: rng() < 0.5,
          }),
        );
      }

      const desired: GroupSpec[] = [];
      const matched: {
        groupId: number;
        expectedAdded: number[];
        sameMeta: boolean;
        meta: { title: string; color: GroupColor; collapsed: boolean };
      }[] = [];
      const fresh: {
        key: string;
        tabIds: number[];
        meta: { title: string; color: GroupColor; collapsed: boolean };
      }[] = [];

      for (const g of liveGroups) {
        // 30% of live groups are left as pure leftovers: no desired spec claims them.
        if (rng() < 0.3) {
          continue;
        }

        const keepCount = 1 + Math.floor(rng() * g.tabIds.length);
        const keep = shuffled(g.tabIds, rng).slice(0, keepCount);
        const added = freshIds(Math.floor(rng() * 3));
        const sameMeta = rng() < 0.5;
        const meta = sameMeta
          ? { title: g.title, color: g.color, collapsed: g.collapsed }
          : {
              title: `${g.title}*`,
              color: pick(
                GROUP_COLORS.filter((c) => c !== g.color),
                rng,
              ),
              collapsed: !g.collapsed,
            };

        const tabIds = shuffled([...keep, ...added], rng);
        const addedSet = new Set(added);

        desired.push({ key: `d${g.groupId}`, tabIds, ...meta });
        matched.push({
          groupId: g.groupId,
          expectedAdded: tabIds.filter((id) => addedSet.has(id)),
          sameMeta,
          meta,
        });
      }

      for (let f = 0; f < Math.floor(rng() * 3); f += 1) {
        const tabIds = freshIds(1 + Math.floor(rng() * 3));
        const meta = { title: `F${f}`, color: pick(GROUP_COLORS, rng), collapsed: rng() < 0.5 };

        desired.push({ key: `f${f}`, tabIds, ...meta });
        fresh.push({ key: `f${f}`, tabIds, meta });
      }

      const ops = planGroupOps(liveGroups, desired);

      let expectedOpCount = 0;
      for (const m of matched) {
        if (m.expectedAdded.length > 0) {
          expect(ops).toContainEqual({
            type: "group",
            tabIds: m.expectedAdded,
            groupId: m.groupId,
          });
          expectedOpCount += 1;
        }
        if (!m.sameMeta) {
          expect(ops).toContainEqual({ type: "update", target: { groupId: m.groupId }, ...m.meta });
          expectedOpCount += 1;
        }
      }
      for (const f of fresh) {
        expect(ops).toContainEqual({ type: "create", key: f.key, tabIds: f.tabIds });
        expect(ops).toContainEqual({ type: "update", target: { key: f.key }, ...f.meta });
        expectedOpCount += 2;
      }

      // Nothing beyond what the construction implies: no ops for leftover live
      // groups, no stray duplicates, no accidental cross-matches.
      expect(ops).toHaveLength(expectedOpCount);
    }
  });
});
