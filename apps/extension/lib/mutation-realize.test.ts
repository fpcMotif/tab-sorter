import { afterEach, describe, expect, it, vi } from "vitest";

import { realizePlan } from "./mutation-realize";
import { TAB_GROUP_NONE } from "@tab-sorter/core/types";
import type { GroupColor, TabPlan } from "@tab-sorter/core/types";

interface FakeStripTab {
  id: number;
  pinned: boolean;
  groupId: number;
}

interface FakeGroupSeed {
  id: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

function createFakeBrowser(initialStrip: FakeStripTab[], initialGroups: FakeGroupSeed[] = []) {
  const strip = initialStrip.map((tab) => ({ ...tab }));
  const groupMeta = new Map(
    initialGroups.map((group) => [
      group.id,
      { title: group.title, color: group.color, collapsed: group.collapsed },
    ]),
  );
  let nextGroupId = Math.max(0, ...initialGroups.map((group) => group.id)) + 1;

  const query = vi.fn(() =>
    Promise.resolve(strip.map((tab, index) => ({ ...tab, index, url: `https://${tab.id}.test` }))),
  );
  const move = vi.fn((id: number, { index }: { index: number }) => {
    const from = strip.findIndex((tab) => tab.id === id);
    const [tab] = strip.splice(from, 1);

    if (tab === undefined) {
      throw new Error(`missing tab ${id}`);
    }

    strip.splice(index, 0, tab);
    return Promise.resolve();
  });
  const group = vi.fn(({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
    const resolvedGroupId = groupId ?? nextGroupId++;
    if (groupId === undefined) {
      groupMeta.set(resolvedGroupId, { title: "", color: "grey", collapsed: false });
    }

    const existing = strip.filter((tab) => tab.groupId === resolvedGroupId);
    const incoming = tabIds
      .filter((id) => !existing.some((tab) => tab.id === id))
      .flatMap((id) => {
        const tab = strip.find((candidate) => candidate.id === id);

        return tab === undefined ? [] : [tab];
      });
    const members = [...existing, ...incoming];
    const memberIds = new Set(members.map((tab) => tab.id));
    const lowestIndex = Math.min(...members.map((tab) => strip.indexOf(tab)));
    const rest = strip.filter((tab) => !memberIds.has(tab.id));
    const insertAt = rest.filter((tab) => strip.indexOf(tab) < lowestIndex).length;

    members.forEach((tab) => {
      tab.groupId = resolvedGroupId;
    });
    rest.splice(insertAt, 0, ...members);
    strip.splice(0, strip.length, ...rest);

    return Promise.resolve(resolvedGroupId);
  });
  const ungroup = vi.fn((tabIds: number[]) => {
    tabIds.forEach((id) => {
      const tab = strip.find((candidate) => candidate.id === id);
      if (tab !== undefined) {
        tab.groupId = TAB_GROUP_NONE;
      }
    });
    return Promise.resolve();
  });
  const remove = vi.fn((tabIds: number[]) => {
    const removed = new Set(tabIds);
    strip.splice(0, strip.length, ...strip.filter((tab) => !removed.has(tab.id)));
    return Promise.resolve();
  });
  const tabGroupsQuery = vi.fn(() => {
    const liveIds = new Set(
      strip.filter((tab) => tab.groupId !== TAB_GROUP_NONE).map((tab) => tab.groupId),
    );

    return Promise.resolve(
      [...liveIds].map((id) => {
        const meta = groupMeta.get(id);

        if (meta === undefined) {
          throw new Error(`missing group ${id}`);
        }

        return Object.assign({ id }, meta);
      }),
    );
  });
  const tabGroupsUpdate = vi.fn(
    (groupId: number, patch: { title: string; color: GroupColor; collapsed: boolean }) => {
      groupMeta.set(groupId, patch);
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
    groupMeta,
    query,
    move,
    group,
    ungroup,
    remove,
    tabGroupsMove,
    tabGroupsUpdate,
    browser: {
      tabs: { query, move, group, ungroup, remove },
      tabGroups: { query: tabGroupsQuery, update: tabGroupsUpdate, move: tabGroupsMove },
    },
  };
}

function ids(strip: FakeStripTab[]): number[] {
  return strip.map((tab) => tab.id);
}

describe("realizePlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("realizes pinned order, groups, metadata, block order, and returns no call counts", async () => {
    const fake = createFakeBrowser([
      { id: 101, pinned: true, groupId: TAB_GROUP_NONE },
      { id: 100, pinned: true, groupId: TAB_GROUP_NONE },
      { id: 26, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 23, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 22, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 25, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 24, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);
    const plan: TabPlan = {
      order: [100, 101, 22, 24, 23, 25, 26],
      groups: [
        { key: "a", title: "Reading", color: "blue", collapsed: false, tabIds: [22, 24] },
        { key: "b", title: "Docs", color: "green", collapsed: true, tabIds: [23, 25] },
      ],
      ungroup: [],
      close: [],
    };

    await expect(realizePlan(plan, 1)).resolves.toBeUndefined();

    expect(ids(fake.strip)).toEqual(plan.order);
    const groupA = fake.strip.find((tab) => tab.id === 22)!.groupId;
    const groupB = fake.strip.find((tab) => tab.id === 23)!.groupId;
    expect(fake.strip.find((tab) => tab.id === 24)!.groupId).toBe(groupA);
    expect(fake.strip.find((tab) => tab.id === 25)!.groupId).toBe(groupB);
    expect(fake.groupMeta.get(groupA)).toEqual({
      title: "Reading",
      color: "blue",
      collapsed: false,
    });
    expect(fake.groupMeta.get(groupB)).toEqual({
      title: "Docs",
      color: "green",
      collapsed: true,
    });
  });

  it("uses the minimal groupless order path and ignores vanished ids", async () => {
    const fake = createFakeBrowser([
      { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 1, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 3, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await realizePlan({ order: [1, 99, 2, 3], groups: [], ungroup: [], close: [] }, 1);

    expect(ids(fake.strip)).toEqual([1, 2, 3]);
    expect(fake.move).toHaveBeenCalledTimes(1);
  });

  it("drops id-less browser rows from groupless order coordinates", async () => {
    const live: Array<{ id?: number; pinned?: boolean; groupId?: number }> = [
      { pinned: false, groupId: TAB_GROUP_NONE },
      { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 1, pinned: false, groupId: TAB_GROUP_NONE },
    ];
    const query = vi.fn(() => Promise.resolve(live.map((tab) => ({ ...tab }))));
    const move = vi.fn((id: number, { index }: { index: number }) => {
      const from = live.findIndex((tab) => tab.id === id);
      const [tab] = live.splice(from, 1);

      if (tab === undefined) {
        throw new Error(`missing tab ${id}`);
      }

      live.splice(index, 0, tab);
      return Promise.resolve();
    });
    vi.stubGlobal("browser", {
      tabs: { query, move },
      tabGroups: { query: vi.fn().mockResolvedValue([]) },
    });

    await realizePlan({ order: [1, 2], groups: [], ungroup: [], close: [] }, 1);

    expect(live.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))).toEqual([1, 2]);
  });

  it("keeps survivor order correct around a foreign tab", async () => {
    const fake = createFakeBrowser(
      [1, 99, 2, 3, 4].map((id) => ({ id, pinned: false, groupId: TAB_GROUP_NONE })),
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan({ order: [2, 3, 4, 1], groups: [], ungroup: [], close: [] }, 1);

    expect(ids(fake.strip).filter((id) => id !== 99)).toEqual([2, 3, 4, 1]);
  });

  it("keeps a live group contiguous and moves its full span", async () => {
    const fake = createFakeBrowser(
      [
        { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 1, pinned: false, groupId: 42 },
        { id: 3, pinned: false, groupId: 42 },
      ],
      [{ id: 42, title: "G", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan({ order: [1, 2, 3], groups: [], ungroup: [], close: [] }, 1);

    expect(ids(fake.strip)).toEqual([1, 3, 2]);
    expect(fake.strip.flatMap((tab, index) => (tab.groupId === 42 ? [index] : []))).toEqual([0, 1]);
  });

  it("adds missing members to the greatest-overlap group and updates metadata", async () => {
    const fake = createFakeBrowser(
      [
        { id: 10, pinned: false, groupId: 5 },
        { id: 20, pinned: false, groupId: 7 },
        { id: 21, pinned: false, groupId: 7 },
        { id: 31, pinned: false, groupId: 8 },
        { id: 30, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [
        { id: 5, title: "Small", color: "grey", collapsed: false },
        { id: 7, title: "Old", color: "blue", collapsed: false },
        { id: 8, title: "Later", color: "green", collapsed: false },
      ],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan(
      {
        order: [],
        groups: [
          {
            key: "g",
            title: "New",
            color: "red",
            collapsed: true,
            tabIds: [10, 20, 21, 30, 31],
          },
        ],
        ungroup: [],
        close: [],
      },
      1,
    );

    expect(fake.strip.find((tab) => tab.id === 30)!.groupId).toBe(7);
    expect(fake.groupMeta.get(7)).toEqual({ title: "New", color: "red", collapsed: true });
  });

  it("breaks equal-overlap ties by the lower group id", async () => {
    const fake = createFakeBrowser(
      [
        { id: 1, pinned: false, groupId: 9 },
        { id: 2, pinned: false, groupId: 5 },
        { id: 3, pinned: false, groupId: 12 },
      ],
      [
        { id: 9, title: "Nine", color: "grey", collapsed: false },
        { id: 5, title: "Five", color: "blue", collapsed: false },
        { id: 12, title: "Twelve", color: "red", collapsed: false },
      ],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan(
      {
        order: [],
        groups: [{ key: "g", title: "Five", color: "blue", collapsed: false, tabIds: [1, 2, 3] }],
        ungroup: [],
        close: [],
      },
      1,
    );

    expect(fake.group).toHaveBeenCalledWith({ tabIds: [1, 3], groupId: 5 });
    expect(fake.strip.every((tab) => tab.groupId === 5)).toBe(true);
  });

  it("claims one live group at most once per plan", async () => {
    const fake = createFakeBrowser(
      [
        { id: 1, pinned: false, groupId: 5 },
        { id: 2, pinned: false, groupId: 5 },
      ],
      [{ id: 5, title: "Shared", color: "blue", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan(
      {
        order: [],
        groups: [
          { key: "first", title: "First", color: "blue", collapsed: false, tabIds: [1] },
          { key: "second", title: "Second", color: "red", collapsed: false, tabIds: [2] },
        ],
        ungroup: [],
        close: [],
      },
      1,
    );

    const secondGroupId = fake.strip.find((tab) => tab.id === 2)!.groupId;
    expect(secondGroupId).not.toBe(5);
    expect(fake.groupMeta.get(secondGroupId)).toEqual({
      title: "Second",
      color: "red",
      collapsed: false,
    });
  });

  it("never reuses an equal-title group with zero member overlap", async () => {
    const fake = createFakeBrowser(
      [
        { id: 90, pinned: false, groupId: 9 },
        { id: 1, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 9, title: "Work", color: "blue", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan(
      {
        order: [],
        groups: [{ key: "work", title: "Work", color: "red", collapsed: true, tabIds: [1, 2] }],
        ungroup: [],
        close: [],
      },
      1,
    );

    expect(fake.strip.find((tab) => tab.id === 90)!.groupId).toBe(9);
    expect(fake.groupMeta.get(9)).toEqual({ title: "Work", color: "blue", collapsed: false });
    const createdId = fake.strip.find((tab) => tab.id === 1)!.groupId;
    expect(createdId).not.toBe(9);
    expect(fake.strip.find((tab) => tab.id === 2)!.groupId).toBe(createdId);
  });

  it("filters pinned and vanished ids before grouping", async () => {
    const fake = createFakeBrowser([
      { id: 7, pinned: true, groupId: TAB_GROUP_NONE },
      { id: 8, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await realizePlan(
      {
        order: [],
        groups: [
          { key: "gone", title: "Gone", color: "grey", collapsed: false, tabIds: [999] },
          { key: "live", title: "Live", color: "blue", collapsed: false, tabIds: [7, 8] },
        ],
        ungroup: [],
        close: [],
      },
      1,
    );

    expect(fake.strip.find((tab) => tab.id === 7)).toMatchObject({
      pinned: true,
      groupId: TAB_GROUP_NONE,
    });
    expect(fake.strip.find((tab) => tab.id === 8)!.groupId).not.toBe(TAB_GROUP_NONE);
  });

  it("reorders members within a matched group", async () => {
    const fake = createFakeBrowser(
      [
        { id: 42, pinned: false, groupId: 777 },
        { id: 41, pinned: false, groupId: 777 },
        { id: 9, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 777, title: "T", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan(
      {
        order: [41, 42, 9],
        groups: [{ key: "g", title: "T", color: "grey", collapsed: false, tabIds: [41, 42] }],
        ungroup: [],
        close: [],
      },
      1,
    );

    expect(ids(fake.strip)).toEqual([41, 42, 9]);
  });

  it("ungroups and closes only surviving targeted tabs", async () => {
    const fake = createFakeBrowser(
      [
        { id: 70, pinned: false, groupId: 999 },
        { id: 71, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 72, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 999, title: "G", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan({ order: [], groups: [], ungroup: [70, 71, 9000], close: [72, 9001] }, 1);

    expect(fake.strip.find((tab) => tab.id === 70)!.groupId).toBe(TAB_GROUP_NONE);
    expect(ids(fake.strip)).toEqual([70, 71]);
  });

  it("ignores stale ungroup and close targets while ordering ungrouped blocks", async () => {
    const fake = createFakeBrowser([
      { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 1, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await realizePlan({ order: [1, 2], groups: [], ungroup: [1, 999], close: [998] }, 1);

    expect(ids(fake.strip)).toEqual([1, 2]);
    expect(fake.ungroup).not.toHaveBeenCalled();
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.move).toHaveBeenCalledWith(1, { index: 0 });
  });

  it("leaves positions alone when order is empty", async () => {
    const fake = createFakeBrowser(
      [5, 3, 1, 2, 4].map((id) => ({ id, pinned: false, groupId: TAB_GROUP_NONE })),
    );
    vi.stubGlobal("browser", fake.browser);

    await realizePlan({ order: [], groups: [], ungroup: [], close: [] }, 1);

    expect(ids(fake.strip)).toEqual([5, 3, 1, 2, 4]);
    expect(fake.move).not.toHaveBeenCalled();
  });

  it("keeps every query scoped to the explicit window id", async () => {
    const windowA = 1;
    const windowB = 2;
    const strips = new Map<number, FakeStripTab[]>([
      [
        windowA,
        [
          { id: 11, pinned: false, groupId: TAB_GROUP_NONE },
          { id: 12, pinned: false, groupId: TAB_GROUP_NONE },
          { id: 13, pinned: false, groupId: TAB_GROUP_NONE },
        ],
      ],
      [windowB, [{ id: 21, pinned: false, groupId: TAB_GROUP_NONE }]],
    ]);
    const query = vi.fn(({ windowId }: { windowId: number }) =>
      Promise.resolve(strips.get(windowId)!.map((tab) => Object.assign({}, tab))),
    );
    const move = vi.fn((id: number, { index }: { index: number }) => {
      const strip = strips.get(windowA)!;
      const from = strip.findIndex((tab) => tab.id === id);
      const [tab] = strip.splice(from, 1);

      if (tab === undefined) {
        throw new Error(`missing tab ${id}`);
      }

      strip.splice(index, 0, tab);
      return Promise.resolve();
    });
    vi.stubGlobal("browser", {
      tabs: { query, move },
      tabGroups: { query: vi.fn().mockResolvedValue([]) },
    });

    await realizePlan({ order: [13, 11, 12], groups: [], ungroup: [], close: [] }, windowA);

    expect(query.mock.calls.every(([input]) => input.windowId === windowA)).toBe(true);
    expect(ids(strips.get(windowA)!)).toEqual([13, 11, 12]);
    expect(ids(strips.get(windowB)!)).toEqual([21]);
  });

  it("normalizes id-less tabs and missing live group titles", async () => {
    const query = vi
      .fn()
      .mockResolvedValue([{ id: 10, pinned: false, groupId: 5 }, { url: "missing.test" }]);
    const update = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      tabs: { query },
      tabGroups: {
        query: vi.fn().mockResolvedValue([{ id: 5, color: "grey", collapsed: false }]),
        update,
      },
    });

    await realizePlan(
      {
        order: [],
        groups: [{ key: "g", title: "New", color: "blue", collapsed: false, tabIds: [10] }],
        ungroup: [],
        close: [],
      },
      1,
    );

    expect(update).toHaveBeenCalledWith(5, {
      title: "New",
      color: "blue",
      collapsed: false,
    });
  });
});
