import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPlan } from "./tabs-service";
import { TAB_GROUP_NONE } from "./types";
import type { GroupColor, TabPlan } from "./types";

// `vanished` is applyPlan's answer to "how many plan-referenced tab ids had
// already disappeared by the time each phase queried the live window?" — a
// detection-only signal, never a change to what gets moved/grouped/closed. This
// file characterizes the count per phase and proves the cross-phase union is by
// DISTINCT id (an id gone for two phases is one vanishing, not two).
//
// A lean in-memory window is enough: `vanished` is derived from each phase's
// fresh query BEFORE that phase mutates anything, so the fake's mutations only
// need to keep later phases' queries self-consistent, not be pixel-perfect.
interface FakeTab {
  id: number;
  pinned: boolean;
  groupId: number;
}

function makeBrowser(seed: FakeTab[], liveGroupIds: number[] = []) {
  const strip: FakeTab[] = seed.map((tab) => ({ ...tab }));
  const meta = new Map<number, { title: string; color: GroupColor; collapsed: boolean }>(
    liveGroupIds.map((id) => [id, { title: "", color: "grey", collapsed: false }]),
  );
  let nextGroupId = Math.max(0, ...liveGroupIds) + 1000;

  const query = vi.fn(() =>
    Promise.resolve(
      strip.map((tab, index) => ({
        id: tab.id,
        pinned: tab.pinned,
        groupId: tab.groupId,
        index,
        url: `https://${tab.id}.test`,
      })),
    ),
  );

  const move = vi.fn((id: number, { index }: { index: number }) => {
    const from = strip.findIndex((tab) => tab.id === id);
    if (from !== -1) {
      const [tab] = strip.splice(from, 1);
      strip.splice(index, 0, tab!);
    }
    return Promise.resolve();
  });

  const group = vi.fn(({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
    const gid = groupId ?? nextGroupId++;
    if (!meta.has(gid)) {
      meta.set(gid, { title: "", color: "grey", collapsed: false });
    }
    for (const tab of strip) {
      if (tabIds.includes(tab.id)) {
        tab.groupId = gid;
      }
    }
    return Promise.resolve(gid);
  });

  const ungroup = vi.fn((ids: number[]) => {
    for (const tab of strip) {
      if (ids.includes(tab.id)) {
        tab.groupId = TAB_GROUP_NONE;
      }
    }
    return Promise.resolve();
  });

  const remove = vi.fn((ids: number[]) => {
    const idSet = new Set(ids);
    strip.splice(0, strip.length, ...strip.filter((tab) => !idSet.has(tab.id)));
    return Promise.resolve();
  });

  const tabGroupsQuery = vi.fn(() => {
    const ids = [
      ...new Set(strip.filter((tab) => tab.groupId !== TAB_GROUP_NONE).map((tab) => tab.groupId)),
    ];
    return Promise.resolve(
      ids.map((id) => {
        const groupMeta = meta.get(id)!;
        return {
          id,
          title: groupMeta.title,
          color: groupMeta.color,
          collapsed: groupMeta.collapsed,
        };
      }),
    );
  });

  const tabGroupsUpdate = vi.fn(
    (id: number, patch: { title: string; color: GroupColor; collapsed: boolean }) => {
      meta.set(id, patch);
      return Promise.resolve();
    },
  );

  const tabGroupsMove = vi.fn((groupId: number, { index }: { index: number }) => {
    const members = strip.filter((tab) => tab.groupId === groupId);
    const rest = strip.filter((tab) => tab.groupId !== groupId);
    rest.splice(index, 0, ...members);
    strip.splice(0, strip.length, ...rest);
    return Promise.resolve();
  });

  return {
    strip,
    browser: {
      tabs: { query, move, group, ungroup, remove },
      tabGroups: { query: tabGroupsQuery, update: tabGroupsUpdate, move: tabGroupsMove },
    },
  };
}

const ungrouped = (id: number, pinned = false): FakeTab => ({
  id,
  pinned,
  groupId: TAB_GROUP_NONE,
});

describe("applyPlan — vanished counting per phase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts a plan.ungroup id absent from the strip, but never an already-ungrouped survivor", async () => {
    // 70 is grouped (a real ungroup target), 71 is present-but-already-ungrouped
    // (a no-op, NOT a vanishing), 9999 is gone entirely (the one vanishing).
    const { browser } = makeBrowser(
      [{ id: 70, pinned: false, groupId: 999 }, ungrouped(71)],
      [999],
    );
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = { order: [], groups: [], ungroup: [70, 71, 9999], close: [] };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(1);
  });

  it("counts a groups non-survivor, but never a live tab excluded only by pinned policy", async () => {
    // 8 is a plain groupable survivor; 7 is a live survivor excluded by the
    // grouping-unpins policy (must NOT count); 9001 is absent (the vanishing).
    const { browser } = makeBrowser([ungrouped(8), ungrouped(7, true)]);
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = {
      order: [],
      groups: [{ key: "g", title: "T", color: "blue", collapsed: false, tabIds: [8, 7, 9001] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(1);
  });

  it("counts a plan.order id absent from the strip on the fast (groupless) path", async () => {
    // No groups anywhere and no live groups -> runOrder takes the fast path and
    // must still compute vanished against its own strip before delegating.
    const { browser } = makeBrowser([ungrouped(2), ungrouped(1)]);
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = { order: [1, 2, 905], groups: [], ungroup: [], close: [] };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(1);
  });

  it("counts a plan.order id absent from the strip on the slow (grouped) path", async () => {
    // A live group forces the block-model slow path; 906 is absent from order.
    const { browser } = makeBrowser(
      [{ id: 5, pinned: false, groupId: 42 }, { id: 6, pinned: false, groupId: 42 }, ungrouped(1)],
      [42],
    );
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = { order: [5, 6, 1, 906], groups: [], ungroup: [], close: [] };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(1);
  });

  it("counts a plan.close id absent from the live query", async () => {
    const { browser } = makeBrowser([ungrouped(80), ungrouped(81)]);
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = { order: [], groups: [], ungroup: [], close: [80, 9999] };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(1);
  });

  it("reports vanished 0 for a fully clean run that exercises all four phases", async () => {
    const { browser } = makeBrowser(
      [{ id: 10, pinned: false, groupId: 42 }, ungrouped(11), ungrouped(12)],
      [42],
    );
    vi.stubGlobal("browser", browser);

    // Every referenced id (10, 11, 12) is live: ungroup 10, group 11+12, order
    // them all, close nothing — no phase sees an absent id.
    const plan: TabPlan = {
      order: [11, 12],
      groups: [{ key: "g", title: "T", color: "green", collapsed: false, tabIds: [11, 12] }],
      ungroup: [10],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(0);
  });
});

describe("applyPlan — vanished is a DISTINCT cross-phase union", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts one absent id referenced by every phase exactly once", async () => {
    // 9999 is absent from the (single-tab) strip yet named in all four phases.
    // Union-by-id collapses those four sightings to a single vanishing.
    const { browser } = makeBrowser([ungrouped(1)]);
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = {
      order: [1, 9999],
      groups: [{ key: "g", title: "T", color: "blue", collapsed: false, tabIds: [1, 9999] }],
      ungroup: [9999],
      close: [9999],
    };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(1);
  });

  it("accumulates DISTINCT absent ids that vanish in different phases", async () => {
    // Different absent ids in different phases add up; nothing double-counts.
    const { browser } = makeBrowser([ungrouped(1)]);
    vi.stubGlobal("browser", browser);

    const plan: TabPlan = { order: [], groups: [], ungroup: [9001], close: [9002] };
    const result = await applyPlan(plan, 1);

    expect(result.vanished).toBe(2);
  });

  it("reports exactly k for k distinct absent ids however they are spread across the phases", async () => {
    // Property: the count scales with distinct absent ids, phase placement is
    // irrelevant. Each absent id is round-robined to one phase; id 1 is the sole
    // live survivor keeping order non-empty (so ORDER actually runs).
    for (let k = 0; k <= 6; k += 1) {
      const { browser } = makeBrowser([ungrouped(1)]);
      vi.stubGlobal("browser", browser);

      const inPhase = (phase: number): number[] =>
        Array.from({ length: k }, (_value, i) => 9000 + i).filter((_id, i) => i % 4 === phase);

      const groupIds = inPhase(1);
      const plan: TabPlan = {
        order: [1, ...inPhase(2)],
        groups:
          groupIds.length > 0
            ? [{ key: "g", title: "T", color: "blue", collapsed: false, tabIds: groupIds }]
            : [],
        ungroup: inPhase(0),
        close: inPhase(3),
      };
      const result = await applyPlan(plan, 1);

      expect(result.vanished).toBe(k);
      vi.unstubAllGlobals();
    }
  });

  it("counts an id that vanishes MID-RUN (alive for UNGROUP and GROUPS, gone before ORDER and CLOSE) exactly once", async () => {
    // The union invariant exercised dynamically, not just against an id absent
    // from the start: tab 55 is alive when UNGROUP and GROUPS query (so neither
    // counts it — UNGROUP even really ungroups it), then closes out from under
    // the action; ORDER and CLOSE both find it missing and both report it —
    // one vanishing, not two.
    const { strip, browser } = makeBrowser(
      [{ id: 55, pinned: false, groupId: 999 }, ungrouped(1), ungrouped(2)],
      [999],
    );
    const liveQuery = browser.tabs.query;
    let stripQueries = 0;
    vi.stubGlobal("browser", {
      ...browser,
      tabs: {
        ...browser.tabs,
        query: vi.fn(() => {
          stripQueries += 1;
          // Phase strip queries land in applyPlan's fixed order: UNGROUP (1),
          // GROUPS (2), ORDER (3), CLOSE (4) — groups being non-empty keeps
          // ORDER on the block-model path, so it issues no second query.
          // Removing 55 just before query 3 is the "user closed it mid-action"
          // moment.
          if (stripQueries === 3) {
            strip.splice(
              strip.findIndex((tab) => tab.id === 55),
              1,
            );
          }
          return liveQuery();
        }),
      },
    });

    const plan: TabPlan = {
      order: [1, 2, 55],
      groups: [{ key: "g", title: "T", color: "blue", collapsed: false, tabIds: [1, 2] }],
      ungroup: [55],
      close: [55],
    };
    const result = await applyPlan(plan, 1);

    // closed: 0 — by CLOSE's own query 55 was already gone, nothing to remove.
    expect(result).toEqual({
      grouped: 2,
      groupsCreated: 1,
      createdGroupKeys: ["g"],
      closed: 0,
      vanished: 1,
    });
  });
});
