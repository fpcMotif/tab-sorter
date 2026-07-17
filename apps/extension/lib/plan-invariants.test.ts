import { describe, expect, it } from "vitest";

import { assemblePlan, planWindowOrder } from "./plan";
import { planTidy } from "./tidy";
import { TAB_GROUP_NONE } from "./types";
import type {
  GroupColor,
  GroupOrder,
  Prefs,
  SnapshotGroup,
  SnapshotTab,
  SortMode,
  TabLite,
  WindowSnapshot,
} from "./types";
import { planUndo } from "./undo";

// Property-based discovery suite for the never-interleave seam that
// assemblePlan owns (CONTEXT.md "assemblePlan"): every TabPlan producer must
// keep the pinned block strictly ahead of the unpinned tail. A seeded PRNG
// keeps every failure reproducible — a red run always points at one fixed
// case, never a once-in-a-thousand flake (mirrors lib/invariants.test.ts).
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

// The load-bearing check shared by every producer below: a non-empty `order`
// must be a permutation of exactly `contractIds`, its first `pinnedIds.size`
// entries must be exactly the pinned ids (as a set — a producer may sort
// them), and no pinned id may appear anywhere after that prefix. This is
// assemblePlan's never-interleave contract, restated at the outer interface
// of each producer that now builds its TabPlan through it.
function expectNeverInterleaved(order: number[], pinnedIds: Set<number>, contractIds: number[]) {
  if (order.length === 0) {
    return;
  }

  expect(isPermutationOf(order, contractIds)).toBe(true);

  const prefix = order.slice(0, pinnedIds.size);
  expect(new Set(prefix)).toEqual(pinnedIds);

  const tail = order.slice(pinnedIds.size);
  expect(tail.some((id) => pinnedIds.has(id))).toBe(false);
}

// A deliberately duplicate-heavy pool: repeated domains and titles so a
// bucketing producer (planTidy) sees real collisions, not just distinct
// singletons.
const TITLES = ["Alpha", "alpha", "Beta", "Issue 2", "Issue 10", "", "  spaced  ", "Zeta"];
const URLS = [
  "https://alpha.example/1",
  "https://alpha.example/2",
  "https://beta.example/1",
  "https://beta.example/2",
  "https://gamma.example/1",
  "https://docs.example.com/x",
  "chrome://settings",
  "about:blank",
];
const GROUP_IDS: (number | undefined)[] = [undefined, 10, 20, 30];

function randomWindow(rng: () => number, n: number): TabLite[] {
  return Array.from({ length: n }, (_value, i) => {
    const pinned = rng() < 0.3;

    return {
      id: i + 1,
      title: pick(TITLES, rng),
      url: pick(URLS, rng),
      index: i,
      pinned,
      // Chrome never groups a pinned tab, so a random fixture only ever
      // assigns a groupId to an unpinned one — the same real invariant
      // planTidy/planUndo lean on.
      groupId: pinned ? TAB_GROUP_NONE : pick(GROUP_IDS, rng),
    };
  });
}

const MODES: SortMode[] = ["title", "domain"];

describe("planWindowOrder — never-interleaves pinned and unpinned ids", () => {
  it("holds the assemblePlan contract for every mode, ignorePinned setting, and random strip", () => {
    const rng = mulberry32(101);

    for (let trial = 0; trial < 800; trial += 1) {
      const tabs = randomWindow(rng, 1 + Math.floor(rng() * 12));
      const mode = pick(MODES, rng);
      const ignorePinned = rng() < 0.5;

      const order = planWindowOrder(tabs, mode, ignorePinned);
      const pinnedIds = new Set(tabs.filter((t) => t.pinned).map((t) => t.id));
      const contractIds = tabs.map((t) => t.id);

      expectNeverInterleaved(order, pinnedIds, contractIds);
    }
  });
});

type TidyPrefs = Pick<
  Prefs,
  "minGroupSize" | "groupOrder" | "collapseAfterTidy" | "regroupExisting"
>;
const GROUP_ORDERS: GroupOrder[] = ["alpha", "sizeDesc"];

describe("planTidy — never-interleaves pinned and unpinned ids", () => {
  it("holds the assemblePlan contract for randomized tidy prefs over random windows", () => {
    const rng = mulberry32(202);

    for (let trial = 0; trial < 800; trial += 1) {
      const tabs = randomWindow(rng, 1 + Math.floor(rng() * 12));
      const prefs: TidyPrefs = {
        minGroupSize: 1 + Math.floor(rng() * 3),
        groupOrder: pick(GROUP_ORDERS, rng),
        collapseAfterTidy: rng() < 0.5,
        regroupExisting: rng() < 0.5,
      };

      const plan = planTidy(tabs, prefs);
      const pinnedIds = new Set(tabs.filter((t) => t.pinned).map((t) => t.id));
      const contractIds = tabs.map((t) => t.id);

      expectNeverInterleaved(plan.order, pinnedIds, contractIds);
    }
  });
});

const COLORS: GroupColor[] = ["grey", "blue", "red", "yellow", "green"];

function stab(
  id: number,
  index: number,
  pinned: boolean,
  groupId: number,
  url: string,
): SnapshotTab {
  return { id, url, index, pinned, groupId };
}

function sgroup(groupId: number, rng: () => number): SnapshotGroup {
  return { groupId, title: `Group ${groupId}`, color: pick(COLORS, rng), collapsed: rng() < 0.5 };
}

// Builds a WindowSnapshot honoring Chrome's real invariants: pinned tabs are
// never grouped, and a group's members form one contiguous run of indices
// with no foreign tab sitting inside it (mirrors lib/undo.test.ts's own
// generator, written independently here since this file must stand alone).
function randomSnapshot(rng: () => number, ids: number[]): WindowSnapshot {
  const pinnedCount = Math.floor(rng() * (ids.length + 1));
  const tabs: SnapshotTab[] = [];
  const groups: SnapshotGroup[] = [];
  let nextGroupId = 1;
  let runGroupId = TAB_GROUP_NONE;

  ids.forEach((id, index) => {
    if (index < pinnedCount) {
      tabs.push(stab(id, index, true, TAB_GROUP_NONE, pick(URLS, rng)));
      return;
    }

    if (index === pinnedCount || rng() < 0.4) {
      runGroupId = rng() < 0.5 ? TAB_GROUP_NONE : nextGroupId++;
      if (runGroupId !== TAB_GROUP_NONE) {
        groups.push(sgroup(runGroupId, rng));
      }
    }

    tabs.push(stab(id, index, false, runGroupId, pick(URLS, rng)));
  });

  return { windowId: 1, tabs, groups, savedAt: 0 };
}

// Current state churns freely against the snapshot: surviving ids are kept
// or dropped at random (the "vanished" case), and fresh ids the snapshot
// never saw are appended (the "added" case) — planUndo must ignore both
// kinds of churn without ever corrupting the never-interleave contract for
// whichever ids do survive.
function randomCurrent(rng: () => number, snapshotIds: number[], addedIds: number[]): TabLite[] {
  const survivors: TabLite[] = snapshotIds
    .filter(() => rng() < 0.8)
    .map((id, index) => ({
      id,
      url: pick(URLS, rng),
      title: pick(TITLES, rng),
      index,
      pinned: rng() < 0.5,
      groupId: rng() < 0.5 ? TAB_GROUP_NONE : Math.floor(rng() * 5) + 1,
    }));
  const added: TabLite[] = addedIds.map((id, i) => ({
    id,
    url: pick(URLS, rng),
    title: pick(TITLES, rng),
    index: survivors.length + i,
    pinned: rng() < 0.5,
    groupId: TAB_GROUP_NONE,
  }));

  return [...survivors, ...added];
}

describe("planUndo — never-interleaves pinned and unpinned survivor ids", () => {
  it("holds the assemblePlan contract over random snapshots with vanished and added tabs", () => {
    const rng = mulberry32(303);

    for (let trial = 0; trial < 800; trial += 1) {
      const n = 1 + Math.floor(rng() * 10);
      const snapshotIds = Array.from({ length: n }, (_value, i) => i + 1);
      const addedIds = Array.from({ length: Math.floor(rng() * 4) }, (_value, i) => 1000 + i);

      const snap = randomSnapshot(rng, snapshotIds);
      const current = randomCurrent(rng, snapshotIds, addedIds);
      const currentIds = new Set(current.map((t) => t.id));

      const { plan } = planUndo(snap, current);

      const survivorIds = snapshotIds.filter((id) => currentIds.has(id));
      const survivorIdSet = new Set(survivorIds);
      const pinnedIds = new Set(
        current.filter((t) => survivorIdSet.has(t.id) && t.pinned).map((t) => t.id),
      );

      expectNeverInterleaved(plan.order, pinnedIds, survivorIds);
    }
  });
});

describe("assemblePlan — defaults and empty regions", () => {
  it("concatenates pinned-first and defaults groups/ungroup/close to empty arrays", () => {
    expect(assemblePlan({ pinnedOrder: [9, 5], unpinnedTail: [1, 2] })).toEqual({
      order: [9, 5, 1, 2],
      groups: [],
      ungroup: [],
      close: [],
    });
  });

  it("passes explicit groups/ungroup/close through unchanged", () => {
    const groups = [
      { key: "a", title: "A", color: "blue" as GroupColor, collapsed: false, tabIds: [1] },
    ];

    expect(
      assemblePlan({ pinnedOrder: [], unpinnedTail: [1, 2], groups, ungroup: [3], close: [4] }),
    ).toEqual({ order: [1, 2], groups, ungroup: [3], close: [4] });
  });

  it("returns an all-empty plan when every region and optional field is empty", () => {
    expect(assemblePlan({ pinnedOrder: [], unpinnedTail: [] })).toEqual({
      order: [],
      groups: [],
      ungroup: [],
      close: [],
    });
  });
});
