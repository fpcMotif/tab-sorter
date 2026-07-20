import { describe, expect, it } from "vitest";

import { planUndo } from "./undo";
import { TAB_GROUP_NONE } from "@tab-sorter/core/types";
import type {
  GroupColor,
  SnapshotGroup,
  SnapshotTab,
  TabLite,
  WindowSnapshot,
} from "@tab-sorter/core/types";

function stab(
  id: number,
  index: number,
  pinned = false,
  groupId: number = TAB_GROUP_NONE,
  url?: string,
): SnapshotTab {
  return { id, url: url ?? `https://s.example/${id}`, index, pinned, groupId };
}

function sgroup(
  groupId: number,
  title: string,
  color: GroupColor = "blue",
  collapsed = false,
): SnapshotGroup {
  return { groupId, title, color, collapsed };
}

function snapshot(tabs: SnapshotTab[], groups: SnapshotGroup[] = []): WindowSnapshot {
  return { windowId: 1, tabs, groups, savedAt: 0 };
}

function ctab(id: number, index: number, pinned = false, groupId?: number): TabLite {
  return { id, url: `https://c.example/${id}`, title: `Tab ${id}`, index, pinned, groupId };
}

describe("planUndo", () => {
  it("restores order and group membership when nothing has changed", () => {
    const snap = snapshot(
      [stab(1, 0, true), stab(2, 1, false, 10), stab(3, 2, false, 10), stab(4, 3, false)],
      [sgroup(10, "Group A")],
    );
    const current = [
      ctab(1, 0, true),
      ctab(2, 1, false, 10),
      ctab(3, 2, false, 10),
      ctab(4, 3, false),
    ];

    const plan = planUndo(snap, current);

    expect(plan).toEqual({
      order: [1, 2, 3, 4],
      groups: [{ key: "g10", title: "Group A", color: "blue", collapsed: false, tabIds: [2, 3] }],
      ungroup: [],
      close: [],
    });
  });

  it("drops vanished ids from both order and group membership", () => {
    const snap = snapshot(
      [stab(1, 0), stab(2, 1, false, 10), stab(3, 2, false, 10), stab(4, 3, false)],
      [sgroup(10, "Group A")],
    );
    // Tab 2 vanished — only tab 3 survives in group 10.
    const current = [ctab(1, 0), ctab(3, 2, false, 10), ctab(4, 3, false)];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([1, 3, 4]);
    expect(plan.groups).toEqual([
      { key: "g10", title: "Group A", color: "blue", collapsed: false, tabIds: [3] },
    ]);
  });

  it("drops missing tabs; the transaction owns reopening", () => {
    const snap = snapshot([
      stab(1, 0),
      stab(2, 1, false, TAB_GROUP_NONE, ""),
      stab(3, 2, false, TAB_GROUP_NONE, "https://gone.example"),
    ]);
    const current = [ctab(1, 0)];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([1]);
  });

  it("excludes a snapshot-group member that is currently pinned from its GroupSpec", () => {
    const snap = snapshot([stab(1, 0, false, 10), stab(2, 1, false, 10)], [sgroup(10, "Group A")]);
    // Tab 1 got pinned since the snapshot; it must leave the group but stay in order.
    const current = [ctab(1, 0, true), ctab(2, 1, false, 10)];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([1, 2]);
    expect(plan.groups).toEqual([
      { key: "g10", title: "Group A", color: "blue", collapsed: false, tabIds: [2] },
    ]);
  });

  it("omits the GroupSpec entirely when every one of its members vanished", () => {
    const snap = snapshot([stab(1, 0, false, 10), stab(2, 1, false, 10)], [sgroup(10, "Group A")]);
    const current: TabLite[] = [];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([]);
    expect(plan.groups).toEqual([]);
  });

  it("still emits a singleton GroupSpec — undo has no minGroupSize floor", () => {
    const snap = snapshot([stab(1, 0, false, 10)], [sgroup(10, "Solo")]);
    const current = [ctab(1, 0, false, 10)];

    const plan = planUndo(snap, current);

    expect(plan.groups).toEqual([
      { key: "g10", title: "Solo", color: "blue", collapsed: false, tabIds: [1] },
    ]);
  });

  it("lists ungroup exactly for survivors newly grouped after being ungrouped at snapshot time", () => {
    const snap = snapshot([
      stab(1, 0, false, TAB_GROUP_NONE), // ungrouped at snapshot, now grouped -> must ungroup
      stab(2, 1, false, TAB_GROUP_NONE), // ungrouped at snapshot, still ungrouped -> untouched
      stab(3, 2, false, 10), // grouped at snapshot, still grouped -> untouched (owned by `groups`)
    ]);
    const current = [
      ctab(1, 0, false, 55),
      ctab(2, 1, false), // groupId omitted entirely (undefined) — still reads as ungrouped
      ctab(3, 2, false, 10),
    ];

    const plan = planUndo(snap, current);

    expect(plan.ungroup).toEqual([1]);
  });

  it("moves a tab whose pin state flipped since the snapshot into the matching current partition", () => {
    const snap = snapshot([stab(1, 0, true), stab(2, 1, false)]);
    // 1 was pinned, now isn't; 2 wasn't, now is — they swap partitions.
    const current = [ctab(1, 0, false), ctab(2, 1, true)];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([2, 1]);
  });

  it("orders each partition by snapshot index, ignoring the order of the current array", () => {
    const snap = snapshot([stab(5, 2), stab(6, 0), stab(7, 1)]);
    const current = [ctab(7, 1), ctab(5, 2), ctab(6, 0)];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([6, 7, 5]);
  });

  it("returns an empty plan for an empty snapshot", () => {
    const plan = planUndo(snapshot([]), []);

    expect(plan).toEqual({ order: [], groups: [], ungroup: [], close: [] });
  });

  it("never restores pinned state itself — only CURRENT pinned flags decide the front partition", () => {
    // Everyone was pinned at snapshot time; nobody is pinned now.
    const snap = snapshot([stab(1, 0, true), stab(2, 1, true)]);
    const current = [ctab(1, 0, false), ctab(2, 1, false)];

    const plan = planUndo(snap, current);

    expect(plan.order).toEqual([1, 2]);
  });
});

// Property-based discovery suite (the invariants.test.ts spirit): fuzzes
// planUndo against realistic snapshots — Chrome's own invariants guarantee a
// group's snapshot indices are contiguous and that a grouped tab is never
// pinned — paired with arbitrary present/current data, and checks the
// contiguity claim `undo.ts` relies on: no foreign id ever gets spliced
// between two members of the same GroupSpec.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS: GroupColor[] = ["grey", "blue", "red", "yellow", "green"];

// Builds a WindowSnapshot honoring Chrome's real invariants: pinned tabs are
// never grouped, and a group's members form a contiguous run of indices with
// no foreign tab (of a different group, or ungrouped) sitting inside it.
function randomSnapshot(rng: () => number, ids: number[]): WindowSnapshot {
  const pinnedCount = Math.floor(rng() * (ids.length + 1));
  const tabs: SnapshotTab[] = [];
  const groups: SnapshotGroup[] = [];
  let nextGroupId = 1;
  let runGroupId = TAB_GROUP_NONE;

  ids.forEach((id, index) => {
    if (index < pinnedCount) {
      tabs.push(stab(id, index, true));
      return;
    }

    if (index === pinnedCount || rng() < 0.4) {
      runGroupId = rng() < 0.5 ? TAB_GROUP_NONE : nextGroupId++;
      if (runGroupId !== TAB_GROUP_NONE) {
        groups.push(
          sgroup(
            runGroupId,
            `Group ${runGroupId}`,
            COLORS[runGroupId % COLORS.length],
            rng() < 0.5,
          ),
        );
      }
    }

    tabs.push(stab(id, index, false, runGroupId));
  });

  return snapshot(tabs, groups);
}

// Current state is intentionally unconstrained (survivors dropped at random,
// pin/group flags reassigned freely) — planUndo must hold its contiguity
// guarantee regardless of how much the live window has drifted.
function randomCurrent(rng: () => number, ids: number[]): TabLite[] {
  return ids
    .filter(() => rng() < 0.8)
    .map((id, index) =>
      ctab(id, index, rng() < 0.5, rng() < 0.5 ? undefined : Math.floor(rng() * 5) + 1),
    );
}

describe("planUndo — contiguity invariant", () => {
  it("keeps every GroupSpec.tabIds a contiguous slice of plan.order", () => {
    const rng = mulberry32(42);

    for (let trial = 0; trial < 500; trial += 1) {
      const n = 1 + Math.floor(rng() * 12);
      const ids = Array.from({ length: n }, (_value, i) => i + 1);
      const snap = randomSnapshot(rng, ids);
      const current = randomCurrent(rng, ids);

      const plan = planUndo(snap, current);

      for (const group of plan.groups) {
        expect(group.tabIds.length).toBeGreaterThan(0);
        const start = plan.order.indexOf(group.tabIds[0]!);
        expect(plan.order.slice(start, start + group.tabIds.length)).toEqual(group.tabIds);
      }
    }
  });
});
